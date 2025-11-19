import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Trade, type ITrade } from '../models/Trade';

function requireAuth(req: FastifyRequest, reply: FastifyReply): req is FastifyRequest & { userId: string } {
  if (!req.userId) {
    (req as any).log?.info?.(
      {
        path: req.url,
        hasAuthHeader: !!req.headers.authorization,
        authHeader: req.headers.authorization,
        cookies: (req as any).cookies,
      },
      'requireAuth: missing userId',
    );
    reply.code(401).send({ error: 'Not authenticated' });
    return false;
  }
  return true;
}

const SideSchema = z.enum(['long', 'short']);

const createActiveTradeSchema = z.object({
  coin: z.string().min(1),
  side: SideSchema,
  entryPrice: z.number().positive(),
  amountInvestedUsd: z.number().positive(),
  leverage: z.number().positive().optional(),
  stopLossPrice: z.number().positive().optional(),
  takeProfitPrice: z.number().positive().optional(),
  entryDate: z.coerce.date().optional(),
  comment: z.string().max(1000).optional(),
});

const createClosedTradeSchema = createActiveTradeSchema.extend({
  exitPrice: z.number().positive(),
  exitDate: z.coerce.date().optional(),
});

const editTradeSchema = z.object({
  comment: z.string().max(1000).optional(),
  stopLossPrice: z.number().positive().nullable().optional(),
  takeProfitPrice: z.number().positive().nullable().optional(),
  coin: z.string().min(1).optional(),
  side: SideSchema.optional(),
  entryPrice: z.number().positive().optional(),
  amountInvestedUsd: z.number().positive().optional(),
  leverage: z.number().positive().nullable().optional(),
  entryDate: z.coerce.date().optional(),
  exitPrice: z.number().positive().optional(),
  exitDate: z.coerce.date().optional(),
});

const closedTradeEditableKeys = ['coin', 'side', 'entryPrice', 'amountInvestedUsd', 'leverage', 'entryDate', 'exitPrice', 'exitDate'] as const;

const addSizeSchema = z.object({
  entryPrice: z.number().positive(),
  amountInvestedUsd: z.number().positive(),
  leverage: z.number().positive().optional(),
  entryDate: z.coerce.date().optional(),
});

const sellSchemaBase = z.object({
  closePrice: z.number().positive(),
  closeDate: z.coerce.date().optional(),
  amountCoin: z.number().positive().optional(),
  amountUsd: z.number().positive().optional(),
  percentage: z.number().positive().max(100).optional(),
});

const sellSchema = sellSchemaBase.refine((data) => {
  const present = ['amountCoin', 'amountUsd', 'percentage'].filter((k) => (data as any)[k] != null);
  return present.length === 1;
}, { message: 'Provide exactly one of amountCoin, amountUsd, or percentage' });

function computeTradeAggregates(trade: ITrade) {
  const entries = trade.entries || [];
  const closes = trade.closes || [];

  let totalInitialMarginUsd = 0;
  let totalEntryCoin = 0;
  let totalEntryNotionalUsd = 0;

  for (const e of entries) {
    const leverage = e.leverage ?? 1;
    const margin = e.amountInvestedUsd;
    const notional = margin * leverage;
    const coin = notional / e.entryPrice;
    totalInitialMarginUsd += margin;
    totalEntryNotionalUsd += notional;
    totalEntryCoin += coin;
  }

  let totalClosedCoin = 0;
  let realizedPnlUsd = 0;
  for (const c of closes) {
    totalClosedCoin += c.closeCoinAmount;
    realizedPnlUsd += c.pnlUsd;
  }

  const openCoin = Math.max(totalEntryCoin - totalClosedCoin, 0);
  const avgEntryPrice = totalEntryCoin > 0 ? totalEntryNotionalUsd / totalEntryCoin : null;
  const effectiveLeverage = totalInitialMarginUsd > 0 ? totalEntryNotionalUsd / totalInitialMarginUsd : null;

  const openNotionalUsd = openCoin > 0 && avgEntryPrice != null ? openCoin * avgEntryPrice : null;
  const openMarginUsd = openNotionalUsd != null && effectiveLeverage && effectiveLeverage > 0
    ? openNotionalUsd / effectiveLeverage
    : null;
  const debtUsd = openNotionalUsd != null && openMarginUsd != null ? openNotionalUsd - openMarginUsd : null;

  const realizedPnlPercent = totalInitialMarginUsd > 0 ? (realizedPnlUsd / totalInitialMarginUsd) * 100 : null;

  let liquidationPrice: number | null = null;
  if (effectiveLeverage && effectiveLeverage > 1 && avgEntryPrice != null) {
    if (trade.side === 'long') {
      liquidationPrice = avgEntryPrice * (1 - 1 / effectiveLeverage);
    } else {
      liquidationPrice = avgEntryPrice * (1 + 1 / effectiveLeverage);
    }
  }

  return {
    totalInitialMarginUsd,
    totalEntryCoin,
    openCoin,
    avgEntryPrice,
    effectiveLeverage,
    openNotionalUsd,
    openMarginUsd,
    debtUsd,
    realizedPnlUsd,
    realizedPnlPercent,
    liquidationPrice,
  };
}

function toTradeDto(trade: ITrade) {
  const metrics = computeTradeAggregates(trade);

  const raw: any = trade as any;
  // When coming from .lean(), we have _id; when coming from .toJSON(), our schema transform
  // moves _id into id and deletes _id. Support both shapes.
  const idValue = raw._id ?? raw.id;

  return {
    id: idValue?.toString?.() ?? idValue,
    coin: trade.coin,
    side: trade.side,
    status: trade.status,
    comment: trade.comment ?? null,
    stopLossPrice: trade.stopLossPrice ?? null,
    takeProfitPrice: trade.takeProfitPrice ?? null,
    entries: trade.entries.map((e) => ({
      entryPrice: e.entryPrice,
      amountInvestedUsd: e.amountInvestedUsd,
      leverage: e.leverage ?? null,
      entryDate: e.entryDate,
    })),
    closes: trade.closes.map((c) => ({
      closePrice: c.closePrice,
      closeCoinAmount: c.closeCoinAmount,
      closeUsdAmount: c.closeUsdAmount,
      closeDate: c.closeDate,
      pnlUsd: c.pnlUsd,
      pnlPercent: c.pnlPercent,
    })),
    metrics,
    createdAt: trade.createdAt,
    updatedAt: trade.updatedAt,
  };
}

export async function registerTradeRoutes(app: FastifyInstance) {
  // List trades
  app.get('/trades', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const status = (req.query as any)?.status as 'active' | 'closed' | undefined;
    const query: any = { userId: req.userId };
    if (status === 'active' || status === 'closed') query.status = status;
    const trades = await Trade.find(query).sort({ createdAt: -1 }).lean<ITrade[]>();
    return reply.send(trades.map(toTradeDto));
  });

  // Summary (Total PnL etc.)
  app.get('/trades/summary', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const trades = await Trade.find({ userId: req.userId, status: 'closed' }).lean<ITrade[]>();
    let totalPnlUsd = 0;
    let totalInvestedUsd = 0;
    let winningTrades = 0;
    
    for (const t of trades) {
      const m = computeTradeAggregates(t);
      totalPnlUsd += m.realizedPnlUsd;
      totalInvestedUsd += m.totalInitialMarginUsd;
      if (m.realizedPnlUsd > 0) {
        winningTrades++;
      }
    }
    
    const totalPnlPercent = totalInvestedUsd > 0 ? (totalPnlUsd / totalInvestedUsd) * 100 : null;
    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : null;
    
    return reply.send({ totalPnlUsd, totalPnlPercent, totalInvestedUsd, totalTrades, winRate });
  });

  // Create active trade
  app.post('/trades/active', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const parsed = createActiveTradeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { coin, side, entryPrice, amountInvestedUsd, leverage, stopLossPrice, takeProfitPrice, entryDate, comment } = parsed.data;

    const entry: ITrade['entries'][number] = {
      entryPrice,
      amountInvestedUsd,
      leverage,
      entryDate: entryDate ?? new Date(),
    };

    const trade = await Trade.create({
      // Let Mongoose cast the string userId to ObjectId
      userId: (req as any).userId,
      side,
      status: 'active',
      coin,
      comment,
      stopLossPrice,
      takeProfitPrice,
      entries: [entry],
      closes: [],
    });

    return reply.code(201).send(toTradeDto(trade.toJSON() as unknown as ITrade));
  });

  // Create already-closed trade
  app.post('/trades/closed', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const parsed = createClosedTradeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { coin, side, entryPrice, amountInvestedUsd, leverage, stopLossPrice, takeProfitPrice, entryDate, comment, exitPrice, exitDate } = parsed.data;

    const entry: ITrade['entries'][number] = {
      entryPrice,
      amountInvestedUsd,
      leverage,
      entryDate: entryDate ?? exitDate ?? new Date(),
    };

    const tmpTrade: ITrade = {
      _id: new (Trade as any).db.base.Types.ObjectId(),
      // For the temporary in-memory trade we only need a string; aggregates do not use userId
      userId: (req as any).userId as any,
      side,
      status: 'closed',
      coin,
      comment,
      stopLossPrice,
      takeProfitPrice,
      entries: [entry],
      closes: [],
      createdAt: exitDate ?? new Date(),
      updatedAt: exitDate ?? new Date(),
    } as any;

    const aggregates = computeTradeAggregates(tmpTrade);
    const fullCoin = aggregates.totalEntryCoin;
    const closeUsdAmount = fullCoin * exitPrice;

    const marginForTrade = aggregates.totalInitialMarginUsd;
    const pnlUsd = side === 'long'
      ? (exitPrice - (aggregates.avgEntryPrice ?? entryPrice)) * fullCoin
      : ((aggregates.avgEntryPrice ?? entryPrice) - exitPrice) * fullCoin;
    const pnlPercent = marginForTrade > 0 ? (pnlUsd / marginForTrade) * 100 : 0;

    const close: ITrade['closes'][number] = {
      closePrice: exitPrice,
      closeCoinAmount: fullCoin,
      closeUsdAmount,
      closeDate: exitDate ?? new Date(),
      pnlUsd,
      pnlPercent,
    };

    const trade = await Trade.create({
      userId: tmpTrade.userId,
      side,
      status: 'closed',
      coin,
      comment,
      stopLossPrice,
      takeProfitPrice,
      entries: [entry],
      closes: [close],
    });

    return reply.code(201).send(toTradeDto(trade.toJSON() as unknown as ITrade));
  });

  // Edit trade basic info
  app.patch('/trades/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const parsed = editTradeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { id } = req.params as any;
    const trade = await Trade.findOne({ _id: id, userId: req.userId });
    if (!trade) return reply.code(404).send({ error: 'Trade not found' });

    const closedFieldsProvided = closedTradeEditableKeys.some((key) => (parsed.data as any)[key] !== undefined);
    if (closedFieldsProvided && trade.status !== 'closed') {
      return reply.code(400).send({ error: 'Only closed trades can edit entry/exit details' });
    }

    if (parsed.data.comment !== undefined) trade.comment = parsed.data.comment;
    if (parsed.data.stopLossPrice !== undefined) trade.stopLossPrice = parsed.data.stopLossPrice ?? undefined;
    if (parsed.data.takeProfitPrice !== undefined) trade.takeProfitPrice = parsed.data.takeProfitPrice ?? undefined;

    if (trade.status === 'closed' && closedFieldsProvided) {
      if (trade.entries.length !== 1 || trade.closes.length !== 1) {
        return reply.code(400).send({ error: 'Editing entry/exit details is only supported for single-entry closed trades' });
      }

      const entry = trade.entries[0];
      const closeRecord = trade.closes[0];

      if (!entry || !closeRecord) {
        return reply.code(400).send({ error: 'Closed trade is missing entry or close information' });
      }

      if (parsed.data.coin !== undefined) trade.coin = parsed.data.coin.toUpperCase();
      if (parsed.data.side !== undefined) trade.side = parsed.data.side;
      if (parsed.data.entryPrice !== undefined) entry.entryPrice = parsed.data.entryPrice;
      if (parsed.data.amountInvestedUsd !== undefined) entry.amountInvestedUsd = parsed.data.amountInvestedUsd;
      if (parsed.data.leverage !== undefined) entry.leverage = parsed.data.leverage ?? undefined;
      if (parsed.data.entryDate !== undefined) entry.entryDate = parsed.data.entryDate ?? entry.entryDate;

      const exitPrice = parsed.data.exitPrice ?? closeRecord.closePrice;
      if (!(exitPrice > 0)) {
        return reply.code(400).send({ error: 'Exit price is required for closed trades' });
      }

      const exitDate = parsed.data.exitDate ?? closeRecord.closeDate ?? new Date();

      const tradeSnapshot = trade.toObject() as ITrade;
      const aggregates = computeTradeAggregates(tradeSnapshot);
      const totalEntryCoin = aggregates.totalEntryCoin;
      if (!(totalEntryCoin > 0)) {
        return reply.code(400).send({ error: 'Trade must have entry size greater than zero' });
      }
      const marginForTrade = aggregates.totalInitialMarginUsd;
      const avgEntry = aggregates.avgEntryPrice ?? entry.entryPrice;
      const closeUsdAmount = totalEntryCoin * exitPrice;
      const pnlUsd = trade.side === 'long'
        ? (exitPrice - avgEntry) * totalEntryCoin
        : (avgEntry - exitPrice) * totalEntryCoin;
      const pnlPercent = marginForTrade > 0 ? (pnlUsd / marginForTrade) * 100 : 0;

      closeRecord.closePrice = exitPrice;
      closeRecord.closeCoinAmount = totalEntryCoin;
      closeRecord.closeUsdAmount = closeUsdAmount;
      closeRecord.closeDate = exitDate;
      closeRecord.pnlUsd = pnlUsd;
      closeRecord.pnlPercent = pnlPercent;
    }

    await trade.save();
    return reply.send(toTradeDto(trade.toJSON() as unknown as ITrade));
  });

  // Add size to active trade
  app.post('/trades/:id/add-size', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const parsed = addSizeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { id } = req.params as any;
    const trade = await Trade.findOne({ _id: id, userId: req.userId });
    if (!trade) return reply.code(404).send({ error: 'Trade not found' });
    if (trade.status !== 'active') return reply.code(400).send({ error: 'Cannot add size to closed trade' });

    trade.entries.push({
      entryPrice: parsed.data.entryPrice,
      amountInvestedUsd: parsed.data.amountInvestedUsd,
      leverage: parsed.data.leverage,
      entryDate: parsed.data.entryDate ?? new Date(),
    });

    await trade.save();
    return reply.send(toTradeDto(trade.toJSON() as unknown as ITrade));
  });

  // Sell / close part of a position
  app.post('/trades/:id/sell', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const parsed = sellSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { id } = req.params as any;
    const trade = await Trade.findOne({ _id: id, userId: req.userId });
    if (!trade) return reply.code(404).send({ error: 'Trade not found' });
    if (trade.status !== 'active') return reply.code(400).send({ error: 'Trade already closed' });

    const aggregatesBefore = computeTradeAggregates(trade.toJSON() as unknown as ITrade);
    if (!aggregatesBefore.avgEntryPrice || aggregatesBefore.totalEntryCoin <= 0 || aggregatesBefore.openCoin <= 0) {
      return reply.code(400).send({ error: 'No open position to sell' });
    }

    const { closePrice, closeDate, amountCoin, amountUsd, percentage } = parsed.data;

    const openCoin = aggregatesBefore.openCoin;
    let closeCoin = 0;
    if (amountCoin != null) {
      closeCoin = amountCoin;
    } else if (amountUsd != null) {
      closeCoin = amountUsd / closePrice;
    } else if (percentage != null) {
      closeCoin = (percentage / 100) * openCoin;
    }

    if (!(closeCoin > 0)) {
      return reply.code(400).send({ error: 'Sell amount must be greater than zero' });
    }

    if (closeCoin > openCoin) closeCoin = openCoin;

    const closeUsdAmount = closeCoin * closePrice;

    const marginForPortion = aggregatesBefore.totalInitialMarginUsd > 0 && aggregatesBefore.totalEntryCoin > 0
      ? aggregatesBefore.totalInitialMarginUsd * (closeCoin / aggregatesBefore.totalEntryCoin)
      : 0;

    const avgEntry = aggregatesBefore.avgEntryPrice;
    const pnlUsd = trade.side === 'long'
      ? (closePrice - avgEntry!) * closeCoin
      : (avgEntry! - closePrice) * closeCoin;

    const pnlPercent = marginForPortion > 0 ? (pnlUsd / marginForPortion) * 100 : 0;

    trade.closes.push({
      closePrice,
      closeCoinAmount: closeCoin,
      closeUsdAmount,
      closeDate: closeDate ?? new Date(),
      pnlUsd,
      pnlPercent,
    });

    const remainingOpenCoin = openCoin - closeCoin;
    if (remainingOpenCoin <= 1e-8) {
      trade.status = 'closed';
    }

    await trade.save();
    return reply.send(toTradeDto(trade.toJSON() as unknown as ITrade));
  });

  // Hard delete trade (will no longer count toward PnL)
  app.delete('/trades/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as any;
    const result = await Trade.deleteOne({ _id: id, userId: req.userId });
    if (result.deletedCount === 0) return reply.code(404).send({ error: 'Trade not found' });
    return reply.send({ ok: true });
  });
}
