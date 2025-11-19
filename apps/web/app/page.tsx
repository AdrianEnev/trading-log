"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/auth-provider';
import { Button } from '../components/ui/button';
import type { Trade, TradeStatus, TradesSummary, TradeSide } from '../lib/api';
import {
  getTrades,
  getTradesSummary,
  createActiveTrade,
  createClosedTrade,
  addTradeSize,
  sellTradePosition,
  deleteTrade,
  editTrade,
} from '../lib/api';

type Tab = 'active' | 'closed';

type SellMode = 'coin' | 'usd' | 'percent';

type NewTradeFormState = {
  coin: string;
  side: TradeSide;
  entryPrice: string;
  amountInvestedUsd: string;
  leverage: string;
  stopLossPrice: string;
  takeProfitPrice: string;
  entryDate: string;
  comment: string;
  exitPrice?: string;
  exitDate?: string;
};

const emptyNewTradeForm = (): NewTradeFormState => ({
  coin: '',
  side: 'long',
  entryPrice: '',
  amountInvestedUsd: '',
  leverage: '',
  stopLossPrice: '',
  takeProfitPrice: '',
  entryDate: '',
  comment: '',
  exitPrice: '',
  exitDate: '',
});

function formatDateInputValue(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function Home() {
  const router = useRouter();
  const { authed, loading: authLoading } = useAuth();

  const [tab, setTab] = useState<Tab>('active');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<TradesSummary | null>(null);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showNewTradeFor, setShowNewTradeFor] = useState<Tab | null>(null);
  const [newTradeForm, setNewTradeForm] = useState<NewTradeFormState>(emptyNewTradeForm);

  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [editComment, setEditComment] = useState('');
  const [editStopLoss, setEditStopLoss] = useState('');
  const [editTakeProfit, setEditTakeProfit] = useState('');
  const [editCoin, setEditCoin] = useState('');
  const [editSide, setEditSide] = useState<TradeSide>('long');
  const [editEntryPrice, setEditEntryPrice] = useState('');
  const [editAmountInvested, setEditAmountInvested] = useState('');
  const [editLeverage, setEditLeverage] = useState('');
  const [editEntryDate, setEditEntryDate] = useState('');
  const [editExitPrice, setEditExitPrice] = useState('');
  const [editExitDate, setEditExitDate] = useState('');

  const [addSizeTrade, setAddSizeTrade] = useState<Trade | null>(null);
  const [addSizeEntryPrice, setAddSizeEntryPrice] = useState('');
  const [addSizeAmount, setAddSizeAmount] = useState('');
  const [addSizeLeverage, setAddSizeLeverage] = useState('');

  const [sellTrade, setSellTrade] = useState<Trade | null>(null);
  const [sellMode, setSellMode] = useState<SellMode>('coin');
  const [sellAmount, setSellAmount] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellDate, setSellDate] = useState('');

  const [deleteTradeTarget, setDeleteTradeTarget] = useState<Trade | null>(null);

  useEffect(() => {
    if (!authLoading && !authed) {
      router.replace('/login');
    }
  }, [authLoading, authed, router]);

  useEffect(() => {
    if (!authed) return;
    setLoadingTrades(true);
    setError(null);
    getTrades(tab as TradeStatus)
      .then(setTrades)
      .catch((e) => setError(e.message || 'Failed to load trades'))
      .finally(() => setLoadingTrades(false));
  }, [authed, tab]);

  useEffect(() => {
    if (!authed) return;
    setLoadingSummary(true);
    getTradesSummary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoadingSummary(false));
  }, [authed]);

  const totalPnlLabel = useMemo(() => {
    if (!summary) return { pnl: '--', pct: '--' };
    const pnl = summary.totalPnlUsd.toFixed(2);
    const pct = summary.totalPnlPercent == null ? '--' : `${summary.totalPnlPercent.toFixed(2)}%`;
    return { pnl, pct };
  }, [summary]);

  function resetNewTradeForm() {
    setNewTradeForm(emptyNewTradeForm());
  }

  function resetEditForm() {
    setEditComment('');
    setEditStopLoss('');
    setEditTakeProfit('');
    setEditCoin('');
    setEditSide('long');
    setEditEntryPrice('');
    setEditAmountInvested('');
    setEditLeverage('');
    setEditEntryDate('');
    setEditExitPrice('');
    setEditExitDate('');
  }

  function closeEditModal() {
    setEditingTrade(null);
    resetEditForm();
  }

  function onOpenNewTrade(which: Tab) {
    resetNewTradeForm();
    setShowNewTradeFor(which);
  }

  async function onSubmitNewTrade(e: React.FormEvent) {
    e.preventDefault();
    if (!showNewTradeFor) return;
    try {
      const base = newTradeForm;
      const payloadCommon = {
        coin: base.coin.trim().toUpperCase(),
        side: base.side,
        entryPrice: parseFloat(base.entryPrice),
        amountInvestedUsd: parseFloat(base.amountInvestedUsd),
        leverage: base.leverage ? parseFloat(base.leverage) : undefined,
        stopLossPrice: base.stopLossPrice ? parseFloat(base.stopLossPrice) : undefined,
        takeProfitPrice: base.takeProfitPrice ? parseFloat(base.takeProfitPrice) : undefined,
        entryDate: base.entryDate || undefined,
        comment: base.comment || undefined,
      } as const;

      let created: Trade;
      if (showNewTradeFor === 'active') {
        created = await createActiveTrade(payloadCommon);
      } else {
        if (!base.exitPrice) throw new Error('Exit price is required for closed trades');
        const payload = {
          ...payloadCommon,
          exitPrice: parseFloat(base.exitPrice),
          exitDate: base.exitDate || undefined,
        } as const;
        created = await createClosedTrade(payload);
      }

      setTrades((prev) => (tab === created.status ? [created, ...prev] : prev));
      setShowNewTradeFor(null);
      resetNewTradeForm();
      const freshSummary = await getTradesSummary();
      setSummary(freshSummary);
    } catch (err: any) {
      setError(err.message || 'Failed to save trade');
    }
  }

  function onEditTrade(t: Trade) {
    resetEditForm();
    setEditingTrade(t);
    setEditComment(t.comment ?? '');
    setEditStopLoss(t.stopLossPrice != null ? String(t.stopLossPrice) : '');
    setEditTakeProfit(t.takeProfitPrice != null ? String(t.takeProfitPrice) : '');
    if (t.status === 'closed') {
      setEditCoin(t.coin);
      setEditSide(t.side);
      const entry = t.entries[0];
      if (entry) {
        setEditEntryPrice(String(entry.entryPrice));
        setEditAmountInvested(String(entry.amountInvestedUsd));
        setEditLeverage(entry.leverage != null ? String(entry.leverage) : '');
        setEditEntryDate(formatDateInputValue(entry.entryDate));
      }
      const closeRecord = t.closes[0];
      if (closeRecord) {
        setEditExitPrice(String(closeRecord.closePrice));
        setEditExitDate(formatDateInputValue(closeRecord.closeDate));
      }
    }
  }

  async function onSubmitEditTrade(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTrade) return;
    try {
      const payload: Parameters<typeof editTrade>[1] = {
        comment: editComment,
        stopLossPrice: editStopLoss ? parseFloat(editStopLoss) : null,
        takeProfitPrice: editTakeProfit ? parseFloat(editTakeProfit) : null,
      };

      const isClosedEdit = editingTrade.status === 'closed';
      if (isClosedEdit) {
        if (!editCoin.trim()) throw new Error('Coin is required for closed trades');
        const entryPriceValue = parseFloat(editEntryPrice);
        if (!Number.isFinite(entryPriceValue)) throw new Error('Entry price is required for closed trades');
        const amountValue = parseFloat(editAmountInvested);
        if (!Number.isFinite(amountValue)) throw new Error('Amount invested is required for closed trades');
        const exitPriceValue = parseFloat(editExitPrice);
        if (!Number.isFinite(exitPriceValue)) throw new Error('Exit price is required for closed trades');

        payload.coin = editCoin.trim().toUpperCase();
        payload.side = editSide;
        payload.entryPrice = entryPriceValue;
        payload.amountInvestedUsd = amountValue;
        payload.leverage = editLeverage ? parseFloat(editLeverage) : null;
        payload.entryDate = editEntryDate ? new Date(editEntryDate).toISOString() : undefined;
        payload.exitPrice = exitPriceValue;
        payload.exitDate = editExitDate ? new Date(editExitDate).toISOString() : undefined;
      }

      const updated = await editTrade(editingTrade.id, payload);
      setTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (editingTrade.status === 'closed') {
        const freshSummary = await getTradesSummary();
        setSummary(freshSummary);
      }
      closeEditModal();
    } catch (err: any) {
      setError(err.message || 'Failed to update trade');
    }
  }

  function onOpenAddSize(t: Trade) {
    setAddSizeTrade(t);
    setAddSizeEntryPrice('');
    setAddSizeAmount('');
    setAddSizeLeverage('');
  }

  async function onSubmitAddSize(e: React.FormEvent) {
    e.preventDefault();
    if (!addSizeTrade) return;
    try {
      const updated = await addTradeSize(addSizeTrade.id, {
        entryPrice: parseFloat(addSizeEntryPrice),
        amountInvestedUsd: parseFloat(addSizeAmount),
        leverage: addSizeLeverage ? parseFloat(addSizeLeverage) : undefined,
        entryDate: new Date().toISOString(),
      });
      setTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setAddSizeTrade(null);
    } catch (err: any) {
      setError(err.message || 'Failed to add size');
    }
  }

  function onOpenSell(t: Trade) {
    setSellTrade(t);
    setSellMode('coin');
    setSellAmount('');
    setSellPrice('');
    setSellDate('');
  }

  async function onSubmitSell(e: React.FormEvent) {
    e.preventDefault();
    if (!sellTrade) return;
    try {
      const payload: any = {
        closePrice: parseFloat(sellPrice),
        closeDate: sellDate || undefined,
      };
      const amountNum = parseFloat(sellAmount);
      if (sellMode === 'coin') payload.amountCoin = amountNum;
      if (sellMode === 'usd') payload.amountUsd = amountNum;
      if (sellMode === 'percent') payload.percentage = amountNum;

      const updated = await sellTradePosition(sellTrade.id, payload);
      setTrades((prev) => {
        const next = prev.map((t) => (t.id === updated.id ? updated : t));
        // If trade became closed while viewing active tab, remove it from list
        if (tab === 'active' && updated.status === 'closed') {
          return next.filter((t) => t.id !== updated.id);
        }
        return next;
      });
      setSellTrade(null);
      const freshSummary = await getTradesSummary();
      setSummary(freshSummary);
    } catch (err: any) {
      setError(err.message || 'Failed to sell position');
    }
  }

  async function onConfirmDelete() {
    if (!deleteTradeTarget) return;
    try {
      await deleteTrade(deleteTradeTarget.id);
      setTrades((prev) => prev.filter((t) => t.id !== deleteTradeTarget.id));
      setDeleteTradeTarget(null);
      const freshSummary = await getTradesSummary();
      setSummary(freshSummary);
    } catch (err: any) {
      setError(err.message || 'Failed to delete trade');
    }
  }

  if (!authed) {
    return null;
  }

  return (
    <div className="w-full max-w-4xl space-y-6">

      <div className='flex flex-row gap-3'>
        {/* Total PNL */}
        <section className={`rounded-2xl border border-gray-200 bg-white p-6 shadow-sm ${trades.length === 0 ? 'w-full' : 'w-1/2'}`}>
            <div className="flex items-end justify-between">
            <div>
                <p className={`text-sm font-medium text-gray-500`}>Total PNL</p>
                <p className={`mt-1 text-3xl font-semibold tracking-tight ${totalPnlLabel.pnl > '0' ? 'text-[#46843E]' : 'text-[#BC3836]'}`}>
                ${totalPnlLabel.pnl}
                </p>
                <p className={`mt-1 text-sm text-gray-500 ${totalPnlLabel.pnl > '0' ? 'text-[#46843E]' : 'text-[#BC3836]'}`}>{totalPnlLabel.pct}</p>
            </div>
            {loadingSummary && <p className="text-xs text-gray-400">Refreshing…</p>}
            </div>
        </section>

        {/* Total Trades */}
        <section className={`rounded-2xl border border-gray-200 bg-white p-6 shadow-sm ${trades.length === 0 ? 'w-full' : 'w-1/2'}`}>
            <div className="flex items-end justify-between">
            <div>
                <p className={`text-sm font-medium text-gray-500`}>Total Trades</p>
                <p className={`mt-1 text-3xl font-semibold tracking-tight text-blue-500`}>
                    {summary?.totalTrades ?? '--'}
                </p>
                <p className={`mt-1 text-sm text-gray-500 `}>
                  {summary?.winRate != null ? `${summary.winRate.toFixed(1)}% WR` : '--'}
                </p>
            </div>
            {loadingSummary && <p className="text-xs text-gray-400">Refreshing…</p>}
            </div>
        </section>
      </div>

      {/* Active / Closed toggle */}
      <section className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setTab('active')}
          className={`h-20 rounded-2xl border text-left px-4 py-3 transition-colors ${
            tab === 'active'
              ? 'border-black bg-black text-white'
              : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
          }`}
        >
          <p className="text-xs uppercase tracking-wide opacity-70">Section</p>
          <p className="mt-1 text-base font-medium">Active trades</p>
        </button>
        <button
          type="button"
          onClick={() => setTab('closed')}
          className={`h-20 rounded-2xl border text-left px-4 py-3 transition-colors ${
            tab === 'closed'
              ? 'border-black bg-black text-white'
              : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
          }`}
        >
          <p className="text-xs uppercase tracking-wide opacity-70">Section</p>
          <p className="mt-1 text-base font-medium">Closed trades</p>
        </button>
      </section>

      {/* New trade button */}
      <section className={trades.length === 0 ? 'flex justify-center' : 'flex justify-end'}>
        <Button className={trades.length === 0 ? 'w-full h-10 rounded-lg' : 'w-auto'} onClick={() => onOpenNewTrade(tab)}>
          {tab === 'active' ? 'Add new trade' : '+'}
        </Button>
      </section>

      {/* Trades list */}
      <section className="space-y-3">
        {error && <p className="text-sm text-[#BC3836]">{error}</p>}
        {loadingTrades && <p className="text-sm text-gray-500">Loading trades…</p>}
        {!loadingTrades && trades.length === 0 && (
          <p className="text-base text-gray-600 font-medium text-center">
            {tab === 'active' ? 'No active trades yet.' : 'No closed trades yet.'}
          </p>
        )}
        {!loadingTrades && trades.map((t) => {
          const isClosed = t.status === 'closed';
          const firstEntryDate = t.entries[0]?.entryDate ? new Date(t.entries[0].entryDate).toLocaleDateString() : null;
          const latestClose = isClosed && t.closes.length > 0 ? t.closes[t.closes.length - 1] : null;
          const exitDateLabel = latestClose ? new Date(latestClose.closeDate).toLocaleDateString() : null;
          const exitPriceLabel = latestClose ? `$${latestClose.closePrice.toFixed(2)}` : '—';
          const investedLabel = `$${t.metrics.totalInitialMarginUsd.toFixed(2)}`;
          const avgEntryLabel = t.metrics.avgEntryPrice != null ? `$${t.metrics.avgEntryPrice.toFixed(2)}` : '—';
          const openNotional = t.metrics.openNotionalUsd;
          const openCoin = t.metrics.openCoin;
          const hasOpenPosition = openNotional != null && openCoin > 0;
          const openPositionLabel = hasOpenPosition ? `$${openNotional.toFixed(2)}` : '—';
          const openCoinLabel = hasOpenPosition ? `${openCoin.toFixed(4)} ${t.coin}` : null;
          const realizedPnlLabel = `$${t.metrics.realizedPnlUsd.toFixed(2)}`;
          const realizedPctLabel = t.metrics.realizedPnlPercent != null ? `${t.metrics.realizedPnlPercent.toFixed(2)}%` : null;
          const pnlColor = t.metrics.realizedPnlUsd > 0
            ? 'text-[#46843E]'
            : t.metrics.realizedPnlUsd < 0
              ? 'text-[#BC3836]'
              : 'text-gray-800';

          return (
            <article
              key={t.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xl font-semibold tracking-tight">{t.coin}</p>
                    <span
                      className={`rounded-full ${
                        t.side === 'long' ? 'bg-[#52ab46] text-white' : 'bg-[#BC3836] text-white'
                      } px-2 py-1 text-xs uppercase tracking-wide font-semibold`}
                    >
                      {t.side === 'long' ? 'Long' : 'Short'}
                    </span>
                    <span
                      className={`rounded-full ${isClosed ? 'bg-[#BC3836]' : 'bg-blue-500'} px-2 py-1 text-xs font-semibold text-white`}
                    >
                      {isClosed ? 'Closed' : 'Active'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {firstEntryDate ? `Entered ${firstEntryDate}` : 'Entry date —'}
                    {isClosed && exitDateLabel && <>{' • '}Closed {exitDateLabel}</>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-gray-500">PNL</p>
                  <p className={`text-lg font-semibold ${isClosed ? pnlColor : 'text-gray-800'}`}>
                    {isClosed ? realizedPnlLabel : hasOpenPosition ? '--' : '--'}
                  </p>
                  {isClosed && realizedPctLabel && (
                    <p className="text-xs text-gray-500">{realizedPctLabel}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Capital deployed</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{investedLabel}</p>
                  <p className="text-xs text-gray-500">Avg entry {avgEntryLabel}</p>
                </div>
                <div className="rounded-xl border border-gray-100 p-3">
                  {isClosed ? (
                    <>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Exit snapshot</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{exitPriceLabel}</p>
                      <p className="text-xs text-gray-500">{exitDateLabel ? `Closed ${exitDateLabel}` : 'Exit date —'}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Open exposure</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{openPositionLabel}</p>
                      <p className="text-xs text-gray-500">{openCoinLabel ?? 'No open size'}</p>
                    </>
                  )}
                </div>
                <div className="rounded-xl border border-gray-100 p-3">
                  {isClosed ? (
                    <>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Performance</p>
                      <p className={`mt-1 text-lg font-semibold ${pnlColor}`}>{realizedPnlLabel}</p>
                      {realizedPctLabel && <p className="text-xs text-gray-500">{realizedPctLabel}</p>}
                    </>
                  ) : (
                    <>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Leverage</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        {t.metrics.effectiveLeverage ? `${t.metrics.effectiveLeverage.toFixed(2)}x` : 'Spot'}
                      </p>
                      {t.metrics.liquidationPrice != null ? (
                        <p className="text-xs text-gray-500">
                          Liq ${t.metrics.liquidationPrice.toFixed(2)}
                          {t.metrics.debtUsd != null && ` • Debt $${t.metrics.debtUsd.toFixed(2)}`}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500">No liquidation risk</p>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <section className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">Entries</p>
                    <p className="text-xs text-gray-500">{t.entries.length} leg{t.entries.length === 1 ? '' : 's'}</p>
                  </div>
                  {t.entries.length === 0 && <p className="mt-2 text-sm text-gray-500">No entries</p>}
                  {t.entries.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {t.entries.map((e, idx) => (
                        <div key={idx} className="flex items-baseline justify-between gap-4 text-sm">
                          <div>
                            <p className="font-semibold text-gray-900">${e.entryPrice.toFixed(2)}</p>
                            <p className="text-xs text-gray-500">Leg {idx + 1}{e.entryDate ? ` • ${new Date(e.entryDate).toLocaleDateString()}` : ''}</p>
                          </div>
                          <div className="text-right text-xs text-gray-500">
                            <p>Size ${e.amountInvestedUsd.toFixed(2)}</p>
                            {e.leverage && <p>Lev {e.leverage.toFixed(2)}x</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-gray-100 bg-white p-4">
                  <p className="text-sm font-semibold text-gray-700">Targets</p>
                  <dl className="mt-3 space-y-2 text-sm text-gray-700">
                    <div className="flex items-center justify-between">
                      <dt className="text-xs uppercase tracking-wide text-gray-500">Stop loss</dt>
                      <dd className="font-semibold">
                        {t.stopLossPrice != null ? `$${t.stopLossPrice.toFixed(2)}` : <span className="text-gray-400">—</span>}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-xs uppercase tracking-wide text-gray-500">Take profit</dt>
                      <dd className="font-semibold">
                        {t.takeProfitPrice != null ? `$${t.takeProfitPrice.toFixed(2)}` : <span className="text-gray-400">—</span>}
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>

              {t.comment && (
                <section className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-700">
                  <p className="font-semibold text-gray-700">Notes</p>
                  <p className="mt-2 leading-relaxed text-gray-700">{t.comment}</p>
                </section>
              )}

              {t.closes.length > 0 && (
                <section className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-xs text-gray-700">
                  <p className="text-sm font-semibold text-gray-700">Sells & exits</p>
                  <div className="mt-2 space-y-2">
                    {t.closes.map((c, idx) => (
                      <div key={idx} className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-gray-900">
                            {c.closeCoinAmount.toFixed(6)} {t.coin}
                            <span className="text-gray-500"> @ ${c.closePrice.toFixed(2)}</span>
                          </p>
                          <p className="text-[11px] text-gray-500">{new Date(c.closeDate).toLocaleDateString()}</p>
                        </div>
                        <div className={`${c.pnlUsd >= 0 ? 'text-[#46843E]' : 'text-[#BC3836]'} font-semibold`}>
                          ${c.pnlUsd.toFixed(2)}
                          <span className="ml-1 text-gray-500">({c.pnlPercent.toFixed(2)}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex gap-3 text-xs font-medium text-gray-700">
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => onEditTrade(t)}
                  >
                    Edit
                  </button>
                  {!isClosed && (
                    <>
                      <button
                        type="button"
                        className="underline-offset-2 hover:underline"
                        onClick={() => onOpenAddSize(t)}
                      >
                        Add size
                      </button>
                      <button
                        type="button"
                        className="underline-offset-2 hover:underline"
                        onClick={() => onOpenSell(t)}
                      >
                        Sell position
                      </button>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className="text-xs text-gray-400 hover:text-[#BC3836]"
                  onClick={() => setDeleteTradeTarget(t)}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {/* New trade modal */}
      {showNewTradeFor && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">
              {showNewTradeFor === 'active' ? 'New active trade' : 'New closed trade'}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Coin names are stored in uppercase. Longs profit when price rises, shorts when price falls.
            </p>
            <form onSubmit={onSubmitNewTrade} className="mt-4 space-y-3 text-sm">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600">Coin</label>
                  <input
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    value={newTradeForm.coin}
                    onChange={(e) => setNewTradeForm((prev) => ({ ...prev, coin: e.target.value.toUpperCase() }))}
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600">Side</label>
                  <div className="mt-1 flex rounded-md border border-gray-300 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setNewTradeForm((p) => ({ ...p, side: 'long' }))}
                      className={`flex-1 rounded px-2 py-1 ${
                        newTradeForm.side === 'long' ? 'bg-black text-white' : 'text-gray-700'
                      }`}
                    >
                      Long
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewTradeForm((p) => ({ ...p, side: 'short' }))}
                      className={`flex-1 rounded px-2 py-1 ${
                        newTradeForm.side === 'short' ? 'bg-black text-white' : 'text-gray-700'
                      }`}
                    >
                      Short
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600">Entry price</label>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    value={newTradeForm.entryPrice}
                    onChange={(e) => setNewTradeForm((p) => ({ ...p, entryPrice: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Amount invested ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    value={newTradeForm.amountInvestedUsd}
                    onChange={(e) => setNewTradeForm((p) => ({ ...p, amountInvestedUsd: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600">Leverage (optional)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    value={newTradeForm.leverage}
                    onChange={(e) => setNewTradeForm((p) => ({ ...p, leverage: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Stop loss</label>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    value={newTradeForm.stopLossPrice}
                    onChange={(e) => setNewTradeForm((p) => ({ ...p, stopLossPrice: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Take profit</label>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    value={newTradeForm.takeProfitPrice}
                    onChange={(e) => setNewTradeForm((p) => ({ ...p, takeProfitPrice: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600">Entry date</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    value={newTradeForm.entryDate}
                    onChange={(e) => setNewTradeForm((p) => ({ ...p, entryDate: e.target.value }))}
                  />
                </div>
                {showNewTradeFor === 'closed' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Exit date</label>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                      value={newTradeForm.exitDate}
                      onChange={(e) => setNewTradeForm((p) => ({ ...p, exitDate: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              {showNewTradeFor === 'closed' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600">Exit price</label>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    value={newTradeForm.exitPrice}
                    onChange={(e) => setNewTradeForm((p) => ({ ...p, exitPrice: e.target.value }))}
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600">Comment</label>
                <textarea
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  rows={3}
                  value={newTradeForm.comment}
                  onChange={(e) => setNewTradeForm((p) => ({ ...p, comment: e.target.value }))}
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowNewTradeFor(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Save trade
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit trade modal */}
      {editingTrade && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Edit trade</h2>
            <form onSubmit={onSubmitEditTrade} className="mt-4 space-y-3 text-sm">
              {editingTrade.status === 'closed' && (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600">Coin</label>
                      <input
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                        value={editCoin}
                        onChange={(e) => setEditCoin(e.target.value.toUpperCase())}
                        required
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600">Side</label>
                      <div className="mt-1 flex rounded-md border border-gray-300 p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setEditSide('long')}
                          className={`flex-1 rounded px-2 py-1 ${
                            editSide === 'long' ? 'bg-black text-white' : 'text-gray-700'
                          }`}
                        >
                          Long
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditSide('short')}
                          className={`flex-1 rounded px-2 py-1 ${
                            editSide === 'short' ? 'bg-black text-white' : 'text-gray-700'
                          }`}
                        >
                          Short
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600">Entry price</label>
                      <input
                        type="number"
                        step="0.01"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                        value={editEntryPrice}
                        onChange={(e) => setEditEntryPrice(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600">Amount invested ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                        value={editAmountInvested}
                        onChange={(e) => setEditAmountInvested(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600">Leverage (optional)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="1"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                        value={editLeverage}
                        onChange={(e) => setEditLeverage(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600">Entry date</label>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                        value={editEntryDate}
                        onChange={(e) => setEditEntryDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600">Exit date</label>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                        value={editExitDate}
                        onChange={(e) => setEditExitDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600">Exit price</label>
                    <input
                      type="number"
                      step="0.01"
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                      value={editExitPrice}
                      onChange={(e) => setEditExitPrice(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600">Comment</label>
                <textarea
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  rows={3}
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600">Stop loss</label>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    value={editStopLoss}
                    onChange={(e) => setEditStopLoss(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Take profit</label>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    value={editTakeProfit}
                    onChange={(e) => setEditTakeProfit(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={closeEditModal}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Save changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add size modal */}
      {addSizeTrade && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Add size to {addSizeTrade.coin}</h2>
            <form onSubmit={onSubmitAddSize} className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600">Entry price</label>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    value={addSizeEntryPrice}
                    onChange={(e) => setAddSizeEntryPrice(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Amount invested ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    value={addSizeAmount}
                    onChange={(e) => setAddSizeAmount(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Leverage (optional)</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  value={addSizeLeverage}
                  onChange={(e) => setAddSizeLeverage(e.target.value)}
                />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setAddSizeTrade(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Add size
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sell position modal */}
      {sellTrade && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Sell position - {sellTrade.coin}</h2>
            <p className="mt-1 text-xs text-gray-500">
              {sellMode === 'coin' && (
                <>Remaining size: {sellTrade.metrics.openCoin.toFixed(6)} {sellTrade.coin}</>
              )}
              {sellMode === 'usd' && sellTrade.metrics.openNotionalUsd != null && (
                <>Remaining size: ${sellTrade.metrics.openNotionalUsd.toFixed(2)}</>
              )}
              {sellMode === 'percent' && sellTrade.metrics.openNotionalUsd != null && (
                <>
                  Remaining size: {sellTrade.metrics.openCoin.toFixed(6)} {sellTrade.coin}
                  {' • '}${sellTrade.metrics.openNotionalUsd.toFixed(2)}
                </>
              )}
            </p>
            <form onSubmit={onSubmitSell} className="mt-4 space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-600">Sell price</label>
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  required
                />
              </div>
              <div className="flex gap-2 text-xs font-medium text-gray-600">
                <button
                  type="button"
                  className={`flex-1 rounded-md border px-2 py-1 ${
                    sellMode === 'percent' ? 'border-black bg-black text-white' : 'border-gray-300'
                  }`}
                  onClick={() => setSellMode('percent')}
                >
                  %
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md border px-2 py-1 ${
                    sellMode === 'usd' ? 'border-black bg-black text-white' : 'border-gray-300'
                  }`}
                  onClick={() => setSellMode('usd')}
                >
                  USD
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md border px-2 py-1 ${
                    sellMode === 'coin' ? 'border-black bg-black text-white' : 'border-gray-300'
                  }`}
                  onClick={() => setSellMode('coin')}
                >
                  Coin
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">
                  {sellMode === 'coin' && `Amount (${sellTrade.coin})`}
                  {sellMode === 'usd' && 'Amount (USD)'}
                  {sellMode === 'percent' && 'Amount (%)'}
                </label>
                {sellMode === 'percent' ? (
                  <>
                    <div className="mt-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-200"
                        style={{
                          background: `linear-gradient(to right, black ${sellAmount || 0}%, #e5e7eb ${sellAmount || 0}%)`
                        }}
                        value={sellAmount || '0'}
                        onChange={(e) => setSellAmount(e.target.value)}
                        required
                      />
                      <div className="mt-1 text-center text-sm font-medium text-gray-700">
                        {sellAmount || 0}%
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {[25, 50, 75, 100].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                            sellAmount === String(pct)
                              ? 'border-black bg-black text-white'
                              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                          onClick={() => setSellAmount(String(pct))}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <input
                    type="number"
                    step="0.000001"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    value={sellAmount}
                    onChange={(e) => setSellAmount(e.target.value)}
                    required
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Sell date</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  value={sellDate}
                  onChange={(e) => setSellDate(e.target.value)}
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSellTrade(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Sell
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTradeTarget && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Delete trade?</h2>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently remove this trade and its PNL from your log. This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDeleteTradeTarget(null)}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onConfirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
