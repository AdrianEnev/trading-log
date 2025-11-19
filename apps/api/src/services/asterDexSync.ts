import type { FastifyBaseLogger } from 'fastify';
import { Types } from 'mongoose';
import { AsterDexClient, type AsterDexClientConfig, type AsterDexPosition } from '../clients/asterDex';
import { Trade, type ITradeEntry, type TradeExchangeProductType, type TradeSide } from '../models/Trade';

export interface AsterDexSyncOptions {
  pollIntervalMs: number;
  userId: string;
}

export interface AsterDexSyncStats {
  totalPositions: number;
  created: number;
  updated: number;
  skipped: number;
  concurrent: boolean;
}

interface PositionTradePayload {
  positionId: string;
  coin: string;
  side: TradeSide;
  entry: ITradeEntry;
  exchangeProductType: TradeExchangeProductType;
  accountId?: string;
}

export class AsterDexSyncService {
  private readonly userObjectId: Types.ObjectId;
  private readonly client: AsterDexClient;
  private timer?: NodeJS.Timeout;
  private syncing = false;
  public readonly userId: string;

  constructor(
    private readonly options: AsterDexSyncOptions,
    clientConfig: AsterDexClientConfig,
    private readonly logger: FastifyBaseLogger,
  ) {
    if (!Types.ObjectId.isValid(options.userId)) {
      throw new Error('ASTERDEX_USER_ID must be a valid Mongo ObjectId');
    }
    this.userId = options.userId;
    this.userObjectId = new Types.ObjectId(options.userId);
    this.client = new AsterDexClient(clientConfig);
  }

  start() {
    if (this.timer) return;
    this.logger.info({ intervalMs: this.options.pollIntervalMs }, 'Aster DEX sync: starting scheduler');
    void this.runSync();
    this.timer = setInterval(() => {
      void this.runSync();
    }, this.options.pollIntervalMs);
  }

  isRunning(): boolean {
    return Boolean(this.timer);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async syncOnce(): Promise<AsterDexSyncStats> {
    return this.runSync();
  }

  private async runSync(): Promise<AsterDexSyncStats> {
    if (this.syncing) {
      this.logger.warn('Aster DEX sync already running; skipping new request');
      return { totalPositions: 0, created: 0, updated: 0, skipped: 0, concurrent: true };
    }

    this.syncing = true;
    try {
      this.logger.debug('Aster DEX sync started');
      const positions = await this.client.fetchOpenPositions();
      this.logger.debug({ count: positions.length }, 'Fetched positions from Aster DEX');
      const stats = await this.syncPositions(positions);
      this.logger.info({ ...stats }, 'Aster DEX sync completed');
      return stats;
    } catch (err) {
      this.logger.error({ err }, 'Aster DEX sync failed');
      return { totalPositions: 0, created: 0, updated: 0, skipped: 0, concurrent: false };
    } finally {
      this.syncing = false;
    }
  }

  private async syncPositions(positions: AsterDexPosition[]): Promise<AsterDexSyncStats> {
    const now = new Date();
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const position of positions) {
      const payload = this.mapPosition(position);
      if (!payload) {
        this.logger.warn({ positionId: position.id, market: position.market }, 'Skipping position due to missing data');
        skipped++;
        continue;
      }

      const result = await this.upsertTrade(payload, now);
      this.logger.debug({
        result,
        coin: payload.coin,
        side: payload.side,
        positionId: payload.positionId,
        productType: payload.exchangeProductType,
      }, 'Processed Aster DEX position');
      if (result === 'created') {
        created++;
      } else {
        updated++;
      }
    }

    return {
      totalPositions: positions.length,
      created,
      updated,
      skipped,
      concurrent: false,
    };
  }

  private async upsertTrade(payload: PositionTradePayload, syncedAt: Date): Promise<'created' | 'updated'> {
    const existing = await Trade.findOne({
      userId: this.userObjectId,
      exchange: 'asterdex',
      exchangePositionId: payload.positionId,
    });

    if (existing) {
      existing.side = payload.side;
      existing.status = 'active';
      existing.coin = payload.coin;
      existing.entries = [payload.entry];
      existing.closes = [];
      existing.source = 'asterdex';
      existing.exchange = 'asterdex';
      existing.exchangeAccountId = payload.accountId;
      existing.exchangePositionId = payload.positionId;
      existing.exchangeProductType = payload.exchangeProductType;
      existing.lastSyncedAt = syncedAt;
      await existing.save();
      return 'updated';
    }

    await Trade.create({
      userId: this.userObjectId,
      side: payload.side,
      status: 'active',
      coin: payload.coin,
      entries: [payload.entry],
      closes: [],
      source: 'asterdex',
      exchange: 'asterdex',
      exchangeAccountId: payload.accountId,
      exchangePositionId: payload.positionId,
      exchangeProductType: payload.exchangeProductType,
      lastSyncedAt: syncedAt,
    });

    return 'created';
  }

  private mapPosition(position: AsterDexPosition): PositionTradePayload | null {
    const positionId = position.id?.toString?.() ?? position.id;
    if (!positionId) return null;

    if (typeof position.size !== 'number' || position.size === 0) return null;
    if (typeof position.entryPrice !== 'number' || !(position.entryPrice > 0)) return null;

    const baseSymbol = position.asset ?? position.market?.split(/[-_/:]/)[0] ?? '';
    if (!baseSymbol) return null;
    const coin = baseSymbol.trim().toUpperCase();
    if (!coin) return null;

    const absoluteSize = Math.abs(position.size);
    const notionalUsd = position.notionalUsd ?? absoluteSize * position.entryPrice;

    const derivedLeverage =
      position.leverage ??
      (position.collateralUsd && position.collateralUsd > 0
        ? notionalUsd / position.collateralUsd
        : undefined);

    const leverageValue = derivedLeverage && derivedLeverage > 1 ? derivedLeverage : 1;
    const exchangeProductType: TradeExchangeProductType = leverageValue > 1 ? 'perpetual' : 'spot';

    const investedUsd =
      exchangeProductType === 'perpetual'
        ? position.collateralUsd ?? (notionalUsd / leverageValue)
        : notionalUsd;

    if (!(investedUsd > 0)) return null;

    const entryDate = position.openedAt ? new Date(position.openedAt) : new Date();

    const entry: ITradeEntry = {
      entryPrice: position.entryPrice,
      amountInvestedUsd: investedUsd,
      leverage: exchangeProductType === 'perpetual' ? leverageValue : 1,
      entryDate,
    };

    const side: TradeSide = position.size > 0 ? 'long' : 'short';

    return {
      positionId,
      coin,
      side,
      entry,
      exchangeProductType,
      accountId: position.accountId,
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    asterDexSync?: AsterDexSyncService;
  }
}
