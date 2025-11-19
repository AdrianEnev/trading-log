import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { AbiCoder, SigningKey, concat, getBytes, keccak256, toUtf8Bytes } from 'ethers';

const DEFAULT_FUTURES_BASE_URL = 'https://fapi.asterdex.com';
const DEFAULT_SPOT_BASE_URL = 'https://api.asterdex.com';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RECV_WINDOW_MS = 5_000;
const abiCoder = AbiCoder.defaultAbiCoder();

type SecurityType = 'NONE' | 'MARKET_DATA' | 'TRADE' | 'USER_DATA' | 'USER_STREAM';

export interface AsterDexClientConfig {
  futuresBaseURL?: string;
  spotBaseURL?: string;
  timeoutMs?: number;
  userAddress: string;
  signerAddress: string;
  signerPrivateKey: string;
  recvWindowMs?: number;
}

export interface AsterDexPosition {
  id: string;
  market: string;
  symbol?: string;
  asset?: string;
  size: number; // signed base asset amount; >0 long, <0 short
  entryPrice: number;
  leverage?: number;
  notionalUsd?: number;
  collateralUsd?: number;
  accountId?: string;
  openedAt?: string;
  productType?: 'spot' | 'perpetual';
  markPrice?: number;
  positionSide?: 'BOTH' | 'LONG' | 'SHORT';
}

interface PositionsResponse {
  positions?: AsterDexPosition[];
  data?: { positions?: AsterDexPosition[] };
}

interface FuturesPositionRaw {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  leverage?: string;
  isolatedMargin?: string;
  notional?: string;
  notionalValue?: string;
  markPrice?: string;
  positionSide?: 'BOTH' | 'LONG' | 'SHORT';
  updateTime?: number;
  accountId?: string;
}

interface SignedRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  params?: Record<string, unknown>;
  base: 'futures' | 'spot';
  securityType?: SecurityType;
}

export class AsterDexClient {
  private readonly futuresHttp: AxiosInstance;
  private readonly spotHttp: AxiosInstance;
  private readonly userAddress: string;
  private readonly signerAddress: string;
  private readonly signingKey: SigningKey;
  private readonly recvWindow: number;
  private readonly nonceOriginMicros: bigint;
  private readonly nonceOriginHrTime: bigint;
  private lastNonce?: bigint;

  constructor(config: AsterDexClientConfig) {
    this.userAddress = config.userAddress;
    this.signerAddress = config.signerAddress;
    this.signingKey = new SigningKey(config.signerPrivateKey);
    this.recvWindow = Math.min(Math.max(config.recvWindowMs ?? DEFAULT_RECV_WINDOW_MS, 1), 60_000);
    this.nonceOriginHrTime = process.hrtime.bigint();
    this.nonceOriginMicros = BigInt(Date.now()) * 1_000n;

    const timeout = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.futuresHttp = axios.create({
      baseURL: (config.futuresBaseURL ?? DEFAULT_FUTURES_BASE_URL).replace(/\/$/, ''),
      timeout,
    });
    this.spotHttp = axios.create({
      baseURL: (config.spotBaseURL ?? DEFAULT_SPOT_BASE_URL).replace(/\/$/, ''),
      timeout,
    });
  }

  async fetchOpenPositions(): Promise<AsterDexPosition[]> {
    const futures = await this.fetchFuturesPositions();
    return futures;
  }

  private async fetchFuturesPositions(): Promise<AsterDexPosition[]> {
    try {
      const res = await this.request<FuturesPositionRaw[] | PositionsResponse>({
        method: 'GET',
        path: '/fapi/v3/position',
        base: 'futures',
        securityType: 'USER_DATA',
      });

      const rawPositions = this.normalizePositionsResponse<FuturesPositionRaw>(res);
      return rawPositions
        .map((raw) => this.mapFuturesPosition(raw))
        .filter((pos): pos is AsterDexPosition => Boolean(pos));
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        // Endpoint returning 404 simply means no active positions for the signer
        return [];
      }
      throw err;
    }
  }

  private mapFuturesPosition(raw: FuturesPositionRaw): AsterDexPosition | null {
    const size = Number(raw.positionAmt);
    if (!Number.isFinite(size) || size === 0) return null;

    const entryPrice = Number(raw.entryPrice);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;

    const leverage = raw.leverage ? Number(raw.leverage) : undefined;
    const notionalCandidate = raw.notionalValue ?? raw.notional;
    const notionalUsd = notionalCandidate ? Number(notionalCandidate) : Math.abs(size) * entryPrice;
    const collateralUsd = raw.isolatedMargin ? Number(raw.isolatedMargin) : undefined;
    const markPrice = raw.markPrice ? Number(raw.markPrice) : undefined;

    const id = `${raw.symbol}:${raw.positionSide ?? 'BOTH'}`;
    const openedAt = raw.updateTime ? new Date(raw.updateTime).toISOString() : undefined;

    return {
      id,
      market: raw.symbol,
      symbol: raw.symbol,
      asset: raw.symbol,
      size,
      entryPrice,
      leverage: Number.isFinite(leverage ?? NaN) ? leverage : undefined,
      notionalUsd: Number.isFinite(notionalUsd) ? notionalUsd : undefined,
      collateralUsd: Number.isFinite(collateralUsd ?? NaN) ? collateralUsd : undefined,
      accountId: raw.accountId,
      openedAt,
      productType: 'perpetual',
      markPrice: Number.isFinite(markPrice ?? NaN) ? markPrice : undefined,
      positionSide: raw.positionSide,
    };
  }

  private normalizePositionsResponse<T>(res: FuturesPositionRaw[] | PositionsResponse): T[] {
    if (Array.isArray(res)) return res as T[];
    if (Array.isArray(res.positions)) return res.positions as T[];
    if (Array.isArray(res.data?.positions)) return res.data.positions as T[];
    return [];
  }

  private async request<T>(options: SignedRequestOptions): Promise<T> {
    const securityType = options.securityType ?? 'NONE';
    const requiresSignature = securityType !== 'NONE';
    const axiosInstance = options.base === 'spot' ? this.spotHttp : this.futuresHttp;
    const payload = requiresSignature
      ? this.buildSignedPayload(options.params ?? {})
      : options.params ?? {};

    const config: AxiosRequestConfig = {
      url: options.path,
      method: options.method,
    };

    if (options.method === 'GET' || options.method === 'DELETE') {
      config.params = payload;
    } else if (requiresSignature) {
      config.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      config.data = new URLSearchParams(payload as Record<string, string>).toString();
    } else {
      config.data = payload;
    }

    const res = await axiosInstance.request<T>(config);
    return res.data;
  }

  private buildSignedPayload(params: Record<string, unknown>): Record<string, string> {
    const timestamp = Date.now();
    const normalized = this.normalizeParams({
      ...params,
      recvWindow: this.recvWindow,
      timestamp,
    });

    const nonce = this.generateNonce();
    const canonicalJson = this.stringifyForSigning(normalized);
    const encoded = abiCoder.encode(
      ['string', 'address', 'address', 'uint256'],
      [canonicalJson, this.userAddress, this.signerAddress, nonce],
    );
    const hash = keccak256(encoded);
    const signature = this.signingKey.sign(this.personalSignHash(hash)).serialized;

    return {
      ...normalized,
      nonce: nonce.toString(),
      user: this.userAddress,
      signer: this.signerAddress,
      signature,
    };
  }

  private normalizeParams(input: Record<string, unknown>): Record<string, string> {
    const output: Record<string, string> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined || value === null) continue;
      const formatted = this.formatParamValue(value);
      if (formatted === undefined) continue;
      output[key] = formatted;
    }
    return output;
  }

  private formatParamValue(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return undefined;
      return value.toString();
    }
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value instanceof Date) return value.getTime().toString();
    if (Array.isArray(value) || typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return undefined;
      }
    }
    return value?.toString?.();
  }

  private stringifyForSigning(params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort();
    const sorted: Record<string, string> = {};
    for (const key of sortedKeys) {
      sorted[key] = params[key];
    }
    return JSON.stringify(sorted);
  }

  private personalSignHash(messageHash: string): string {
    const messageBytes = getBytes(messageHash);
    const prefix = toUtf8Bytes(`\x19Ethereum Signed Message:\n${messageBytes.length}`);
    return keccak256(concat([prefix, messageBytes]));
  }

  private generateNonce(): bigint {
    const elapsedNs = process.hrtime.bigint() - this.nonceOriginHrTime;
    const base = this.nonceOriginMicros + elapsedNs / 1_000n;
    const last = this.lastNonce ?? 0n;
    const next = base <= last ? last + 1n : base;
    this.lastNonce = next;
    return next;
  }
}
