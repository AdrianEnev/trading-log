import mongoose, { Schema, model, Model, Types } from 'mongoose';

export type TradeSide = 'long' | 'short';
export type TradeStatus = 'active' | 'closed';

export interface ITradeEntry {
  entryPrice: number;
  amountInvestedUsd: number;
  leverage?: number;
  entryDate: Date;
}

export interface ITradeClose {
  closePrice: number;
  closeCoinAmount: number;
  closeUsdAmount: number;
  closeDate: Date;
  pnlUsd: number;
  pnlPercent: number;
}

export type TradeSource = 'manual' | 'asterdex';
export type TradeExchangeProductType = 'spot' | 'perpetual';

export interface ITrade {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  side: TradeSide;
  status: TradeStatus;
  coin: string;
  comment?: string;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  entries: ITradeEntry[];
  closes: ITradeClose[];
  source?: TradeSource;
  exchange?: string;
  exchangeAccountId?: string;
  exchangePositionId?: string;
  exchangeProductType?: TradeExchangeProductType;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TradeEntrySchema = new Schema<ITradeEntry>(
  {
    entryPrice: { type: Number, required: true },
    amountInvestedUsd: { type: Number, required: true },
    leverage: { type: Number },
    entryDate: { type: Date, required: true },
  },
  { _id: false }
);

const TradeCloseSchema = new Schema<ITradeClose>(
  {
    closePrice: { type: Number, required: true },
    closeCoinAmount: { type: Number, required: true },
    closeUsdAmount: { type: Number, required: true },
    closeDate: { type: Date, required: true },
    pnlUsd: { type: Number, required: true },
    pnlPercent: { type: Number, required: true },
  },
  { _id: false }
);

const TradeSchema = new Schema<ITrade>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    side: { type: String, enum: ['long', 'short'], required: true },
    status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },
    coin: { type: String, required: true, trim: true, uppercase: true },
    comment: { type: String },
    stopLossPrice: { type: Number },
    takeProfitPrice: { type: Number },
    entries: { type: [TradeEntrySchema], default: [] },
    closes: { type: [TradeCloseSchema], default: [] },
    source: { type: String, enum: ['manual', 'asterdex'], default: 'manual', index: true },
    exchange: { type: String, index: true },
    exchangeAccountId: { type: String },
    exchangePositionId: { type: String },
    exchangeProductType: { type: String, enum: ['spot', 'perpetual'], default: undefined },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true }
);

TradeSchema.index(
  { userId: 1, exchange: 1, exchangePositionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      exchange: { $exists: true, $ne: null },
      exchangePositionId: { $exists: true, $ne: null },
    },
  }
);

TradeSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    const r: any = ret as any;
    r.id = r._id?.toString?.() ?? r._id;
    delete r._id;
    delete r.__v;
    delete r.userId;
    return r;
  },
});

export const Trade =
  (mongoose.models.Trade as Model<ITrade>) || model<ITrade>('Trade', TradeSchema);
