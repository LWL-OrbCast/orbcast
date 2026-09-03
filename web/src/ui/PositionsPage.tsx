import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applySettledOutcomeLabels,
  cancelOutcomeOrder,
  closedLotsFromFills,
  displayListedTitle,
  fetchHlAllTimePnl,
  fetchOutcomeCancelledOrders,
  fetchOutcomeFills,
  fetchOutcomeOpenOrders,
  fetchSettledOutcomeLabels,
  HIP4_CATALOG_STALE_MS,
  HIP4_CATALOG_POLL_MS,
  HIP4_POSITIONS_MIDS_POLL_MS,
  formatOutcomeCents,
  impliedPercent,
  listOutcomes,
  fetchAllMids,
  overlayListedMids,
  netPnlUsd,
  outcomeIdsNeedingSettledLabels,
  outcomeRealizedPnlFromFills,
  outcomeSpotCoin,
  outcomeVolumeFromFills,
  parseSideCoin,
  placeOutcomeOrder,
  positionsFromSpotBalances,
  releaseOutcomeSellHolds,
  type ListedMarket,
  type OutcomeCancelledOrder,
  type OutcomeClosedLot,
  type OutcomeOpenOrder,
  type OutcomePosition,
  type OutcomeSide,
} from '@hip4';
import { interpolate, tHip4, useCopy } from '../lib/copy';
import { reportTrade } from '../lib/api';
import { useWebAuth } from '../lib/auth';
import { useSpotAccount } from '../lib/useSpotAccount';
import {
  inspectWebSetup,
  prepareWebAccount,
  readCachedWebSetup,
} from '../lib/webKernel';
import {
  extractHyperliquidErrorText,
  humanizeHyperliquidErrorWith,
} from '../../../frontend/src/lib/hyperliquidErrorMatch';
import { AuthGate, HistoryListSkeleton, PositionsSkeleton } from './skeleton';
import { RollingNumber } from './RollingNumber';
import {
  OrderTicketModal,
  type OrderTicketError,
  type OrderTicketPayload,
  type OrderTicketStatus,
} from './OrderTicketModal';
import { NO_COLOR, YES_COLOR } from './outcomeColors';

type Tab = 'open' | 'orders' | 'history';
const HISTORY_CAP = 12;

function canMarketClose(item: OutcomePosition): boolean {
  return item.status !== 'settled' && item.shares >= 1;
}

function closeTicketPayload(item: OutcomePosition): OrderTicketPayload {
  const px = item.probability != null && item.probability > 0 ? item.probability : null;
  return {
    tradeSide: 'sell',
    sideName: item.sideName,
    heading: item.title,
    shares: item.shares,
    usd: px != null ? item.shares * px : item.valueUsd,
    px,
    accent: item.side === 0 ? YES_COLOR : NO_COLOR,
    closingAll: true,
  };
}

function formatSignedUsd(n: number): string {
  const abs = Math.abs(n).toFixed(2);
  if (n > 0.004) return `+$${abs}`;
  if (n < -0.004) return `-$${abs}`;
  return `$${abs}`;
}

function formatWhen(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SideBadge({ side, name }: { side: 0 | 1; name: string }) {
  const yes = side === 0;
  return (
    <span
      className={`inline-flex min-w-[2.5rem] shrink-0 items-center justify-center rounded-lg px-2 py-1 text-[11px] font-extrabold leading-none ${
        yes ? 'bg-[#22C55E18] text-[var(--yes)]' : 'bg-[#A78BFA22] text-[var(--no)]'
      }`}
    >
      {name}
    </span>
  );
}

function TradeBadge({ buy, label }: { buy: boolean; label: string }) {
  return (
    <span
      className={`inline-flex min-w-[2.5rem] shrink-0 items-center justify-center rounded-lg px-2 py-1 text-[11px] font-extrabold leading-none capitalize ${
        buy ? 'bg-[#22C55E18] text-[var(--yes)]' : 'bg-[#F43F5E18] text-[var(--danger)]'
      }`}
    >
      {label}
    </span>
  );
}

export function PositionsPage() {
  const { hip4 } = useCopy();
  const { authenticated, address, getProvider, getAccessToken, signingReady } = useWebAuth();
  const [tab, setTab] = useState<Tab>('open');
  const [historyShowAll, setHistoryShowAll] = useState(false);
  const [ticket, setTicket] = useState<{
    phase: 'confirm' | 'receipt' | 'error';
    outcomeId: number;
    side: OutcomeSide;
    status?: OrderTicketStatus;
    error?: OrderTicketError;
    payload: OrderTicketPayload;
  } | null>(null);
  const qc = useQueryClient();
  const spot = useSpotAccount(address, authenticated);

  const catalog = useQuery({
    queryKey: ['hip4', 'outcomes'],
    queryFn: () => listOutcomes({ filter: 'all' }),
    staleTime: HIP4_CATALOG_STALE_MS,
    refetchInterval: HIP4_CATALOG_POLL_MS,
  });

  const catalogMarkets = catalog.data ?? [];

  const hasOutcomeHoldings = useMemo(
    () =>
      spot.balances.some((b) => {
        const parsed = parseSideCoin(String(b.coin ?? b.token ?? ''));
        return !!parsed && (Number(b.total) || 0) > 0;
      }),
    [spot.balances],
  );

  const liveMidsQ = useQuery({
    queryKey: ['hip4', 'allMids'],
    queryFn: () => fetchAllMids(true),
    enabled: authenticated && tab === 'open' && hasOutcomeHoldings,
    staleTime: 4_000,
    refetchInterval: tab === 'open' && hasOutcomeHoldings ? HIP4_POSITIONS_MIDS_POLL_MS : false,
  });

  const markets = useMemo(
    () => overlayListedMids(catalogMarkets, liveMidsQ.data),
    [catalogMarkets, liveMidsQ.data],
  );

  const ordersQ = useQuery({
    queryKey: ['hip4', 'open-orders', address],
    queryFn: () => fetchOutcomeOpenOrders(address!),
    enabled: !!address,
    staleTime: 4_000,
    refetchInterval: 8_000,
  });

  const fillsQ = useQuery({
    queryKey: ['hip4', 'fills', address],
    queryFn: () => fetchOutcomeFills(address!),
    enabled: !!address,
    staleTime: 30_000,
  });

  const cancelledQ = useQuery({
    queryKey: ['hip4', 'historical-cancels', address],
    queryFn: async () => {
      try {
        return await fetchOutcomeCancelledOrders(address!);
      } catch {
        return [];
      }
    },
    enabled: !!address,
    staleTime: 30_000,
  });

  const fills = fillsQ.data ?? [];
  const needLabels = useMemo(
    () =>
      outcomeIdsNeedingSettledLabels(fills, markets, [
        ...spot.balances.map((b) => String(b.coin ?? b.token ?? '')),
        ...(cancelledQ.data ?? []).map((o) => outcomeSpotCoin(o.outcomeId, o.side)),
      ]),
    [fills, markets, spot.balances, cancelledQ.data],
  );
  const labelsQ = useQuery({
    queryKey: ['hip4', 'settled-labels', address, needLabels.join(',')],
    queryFn: () => fetchSettledOutcomeLabels(needLabels),
    enabled: !!address && needLabels.length > 0,
    staleTime: 60_000,
  });

  const open = useMemo(
    () =>
      applySettledOutcomeLabels(
        address ? positionsFromSpotBalances(spot.balances, markets) : [],
        labelsQ.data,
      ),
    [address, spot.balances, markets, labelsQ.data],
  );

  const lots = useMemo(
    () => applySettledOutcomeLabels(closedLotsFromFills(fills, markets), labelsQ.data),
    [fills, markets, labelsQ.data],
  );
  const cancelled = useMemo(() => {
    const rows = cancelledQ.data ?? [];
    return applySettledOutcomeLabels(
      rows.map((row) => {
        const market = markets.find((m) => m.outcomeId === row.outcomeId);
        if (!market) return row;
        const sideMeta = market.sides.find((s) => s.side === row.side);
        return {
          ...row,
          title: displayListedTitle(market),
          sideName: sideMeta?.name ?? row.sideName,
        };
      }),
      labelsQ.data,
    );
  }, [cancelledQ.data, markets, labelsQ.data]);

  const historyRows = useMemo(() => {
    const rows: Array<OutcomeClosedLot | OutcomeCancelledOrder> = [...lots, ...cancelled];
    return rows.sort((a, b) => {
      const ta = 'cancelledAt' in a ? a.cancelledAt : a.closedAt;
      const tb = 'cancelledAt' in b ? b.cancelledAt : b.closedAt;
      return tb - ta;
    });
  }, [lots, cancelled]);

  const pnlQ = useQuery({
    queryKey: ['hip4', 'hl-pnl', address],
    queryFn: () => fetchHlAllTimePnl(address!),
    enabled: !!address,
    staleTime: 60_000,
  });

  const cancelMut = useMutation({
    mutationFn: (o: OutcomeOpenOrder) =>
      cancelOutcomeOrder({ oid: o.oid, outcomeId: o.outcomeId, side: o.side }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['hip4', 'open-orders'] }),
  });

  const setupQ = useQuery({
    queryKey: ['hip4', 'setup', address],
    queryFn: () => inspectWebSetup(address!),
    enabled: !!address && authenticated && signingReady,
    staleTime: 30_000,
    placeholderData: (previous) =>
      previous ?? (address ? readCachedWebSetup(address) : undefined),
  });

  const closeMut = useMutation({
    mutationFn: async (vars: {
      outcomeId: number;
      side: OutcomeSide;
      sizeUsd: number;
      sizeShares: number;
      referencePx: number;
    }) => {
      if (!address) throw new Error(hip4.header.signIn);
      const provider = await getProvider();
      if (!provider) throw new Error('Wallet not ready');
      await prepareWebAccount(provider, address, setupQ.data);
      await qc.invalidateQueries({ queryKey: ['hip4', 'setup'] });
      const sizeShares = await releaseOutcomeSellHolds({
        user: address,
        outcomeId: vars.outcomeId,
        side: vars.side,
      });
      void qc.invalidateQueries({ queryKey: ['hip4', 'open-orders'] });
      if (!(sizeShares >= 1)) {
        throw new Error(hip4.ticket.noFreeShares);
      }
      const result = await placeOutcomeOrder({
        outcomeId: vars.outcomeId,
        side: vars.side,
        tradeSide: 'sell',
        orderType: 'market',
        sizeUsd: vars.sizeUsd,
        sizeShares,
        skipMinNotional: true,
        referencePx: vars.referencePx,
      });
      const token = await getAccessToken();
      if (token) await reportTrade(address, token).catch(() => undefined);
      return { result, sizeShares };
    },
    onSuccess: ({ result, sizeShares }) => {
      void qc.invalidateQueries({ queryKey: ['hip4'] });
      setTicket((t) => {
        if (!t) return t;
        const filled =
          result.filledShares != null && result.filledShares > 0 ? result.filledShares : sizeShares;
        const avg = result.avgPx != null && result.avgPx > 0 ? result.avgPx : t.payload.px;
        const usd = result.status === 'filled' && avg != null ? filled * avg : t.payload.usd;
        return {
          ...t,
          phase: 'receipt',
          status: result.status,
          payload: { ...t.payload, shares: filled, usd, px: avg },
        };
      });
    },
    onError: (e: unknown) => {
      const nice = humanizeHyperliquidErrorWith(extractHyperliquidErrorText(e), tHip4);
      setTicket((t) =>
        t ? { ...t, phase: 'error', error: { title: nice.title, message: nice.message } } : t,
      );
    },
  });

  const liveClosePayload = useMemo((): OrderTicketPayload | null => {
    if (!ticket) return null;
    if (ticket.phase !== 'confirm' || closeMut.isPending) return ticket.payload;
    const live = open.find((p) => p.outcomeId === ticket.outcomeId && p.side === ticket.side);
    if (!live || !canMarketClose(live)) return ticket.payload;
    return closeTicketPayload(live);
  }, [ticket, closeMut.isPending, open]);

  const openClose = (item: OutcomePosition) => {
    if (closeMut.isPending || ticket) return;
    if (!canMarketClose(item)) return;
    const px = item.probability;
    if (px == null || !(px > 0)) return;
    setTicket({
      phase: 'confirm',
      outcomeId: item.outcomeId,
      side: item.side,
      payload: closeTicketPayload(item),
    });
  };

  const placeClose = () => {
    if (!ticket || ticket.phase !== 'confirm' || closeMut.isPending) return;
    const quote = liveClosePayload ?? ticket.payload;
    const px = quote.px;
    const shares = quote.shares;
    if (px == null || !(px > 0) || shares < 1) {
      setTicket(null);
      return;
    }
    const frozen: OrderTicketPayload = {
      ...quote,
      shares,
      usd: shares * px,
      closingAll: true,
    };
    setTicket({ ...ticket, payload: frozen });
    closeMut.mutate({
      outcomeId: ticket.outcomeId,
      side: ticket.side,
      sizeUsd: shares * px,
      sizeShares: shares,
      referencePx: px,
    });
  };

  const valueUsd = open.reduce((s, p) => s + p.valueUsd, 0);
  const unrealized = open.reduce((s, p) => s + (p.pnlUsd ?? 0), 0);
  const volumeUsd = outcomeVolumeFromFills(fills);
  const realized = outcomeRealizedPnlFromFills(fills);
  const pnlUsd = netPnlUsd(pnlQ.data, unrealized, realized);

  const orders = ordersQ.data ?? [];
  const openLoading = !spot.hydrated || (catalog.isPending && !catalog.data);
  const ordersLoading = ordersQ.isPending && !ordersQ.isFetched;
  const historyLoading =
    (fillsQ.isPending && !fillsQ.isFetched) ||
    (cancelledQ.isPending && !cancelledQ.isFetched && !(fills.length > 0));

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'open', label: hip4.positions.tabOpen, count: openLoading ? 0 : open.length },
    { id: 'orders', label: hip4.positions.tabOrders, count: ordersLoading ? 0 : orders.length },
    { id: 'history', label: hip4.positions.tabHistory, count: 0 },
  ];

  const visibleHistory = historyShowAll ? historyRows : historyRows.slice(0, HISTORY_CAP);
  const historyHidden = Math.max(0, historyRows.length - visibleHistory.length);

  return (
    <AuthGate
      skeleton={<PositionsSkeleton />}
      title={hip4.positions.title}
      body={hip4.positions.signInBody}
      cta={hip4.positions.logIn}
    >
      {() => (
        <div>
          <h1 className="text-2xl font-extrabold">{hip4.positions.title}</h1>
          <div className="mt-4 grid grid-cols-3 gap-3 rounded-2xl border border-[var(--border)] bg-white p-4">
            <div>
              <div className="text-xs font-bold uppercase text-[var(--text-3)]">{hip4.positions.statOpen}</div>
              <div className="mt-1 text-xl font-extrabold">
                {openLoading ? '—' : `$${valueUsd.toFixed(2)}`}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase text-[var(--text-3)]">{hip4.positions.statPnl}</div>
              <div
                className={`mt-1 text-xl font-extrabold ${
                  pnlUsd > 0.004 ? 'text-[var(--yes)]' : pnlUsd < -0.004 ? 'text-[var(--no)]' : ''
                }`}
              >
                {openLoading && historyLoading ? '—' : formatSignedUsd(pnlUsd)}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase text-[var(--text-3)]">{hip4.positions.statVolume}</div>
              <div className="mt-1 text-xl font-extrabold">
                {historyLoading ? '—' : `$${volumeUsd.toFixed(2)}`}
              </div>
            </div>
          </div>

          <div className="mt-6 flex rounded-xl bg-[var(--bg-2)] p-1">
            {tabs.map((item) => {
              const on = tab === item.id;
              const label = item.count > 0 ? `${item.label} (${item.count})` : item.label;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-[11px] font-extrabold sm:text-xs ${
                    on
                      ? 'bg-white text-[var(--accent-dark)] shadow-sm'
                      : 'text-[var(--text-2)] hover:text-[var(--text)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--text-3)]">
            {tab === 'open'
              ? hip4.positions.openHint
              : tab === 'orders'
                ? hip4.positions.ordersHint
                : hip4.positions.historyHint}
          </p>

          <div key={tab} className="page-enter mt-4 flex flex-col gap-2">
            {tab === 'open' ? (
              openLoading ? (
                <HistoryListSkeleton />
              ) : open.length ? (
                open.map((p) => (
                  <OpenRow
                    key={`${p.outcomeId}:${p.side}`}
                    item={p}
                    onClose={() => openClose(p)}
                    closing={
                      closeMut.isPending &&
                      ticket?.outcomeId === p.outcomeId &&
                      ticket.side === p.side
                    }
                  />
                ))
              ) : (
                <Empty title={hip4.positions.emptyOpen} body={hip4.positions.emptyOpenBody} />
              )
            ) : null}
            {tab === 'orders' ? (
              ordersLoading ? (
                <HistoryListSkeleton />
              ) : orders.length ? (
                orders.map((o) => (
                  <OrderRow
                    key={o.oid}
                    item={o}
                    markets={markets}
                    onCancel={() => cancelMut.mutate(o)}
                    pending={cancelMut.isPending && cancelMut.variables?.oid === o.oid}
                  />
                ))
              ) : (
                <Empty title={hip4.positions.emptyOrders} body={hip4.positions.emptyOrdersBody} />
              )
            ) : null}
            {tab === 'history' ? (
              historyLoading ? (
                <HistoryListSkeleton />
              ) : (
                <HistoryList
                  rows={visibleHistory}
                  hidden={historyHidden}
                  onShowMore={() => setHistoryShowAll(true)}
                />
              )
            ) : null}
          </div>

          <OrderTicketModal
            open={!!ticket}
            phase={ticket?.phase ?? 'confirm'}
            payload={liveClosePayload}
            status={ticket?.status}
            error={ticket?.error}
            busy={closeMut.isPending}
            livePrice={ticket?.phase === 'confirm' && !closeMut.isPending}
            onConfirm={placeClose}
            onClose={() => {
              if (!closeMut.isPending) setTicket(null);
            }}
          />
        </div>
      )}
    </AuthGate>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  const { hip4 } = useCopy();
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-8 text-center">
      <p className="font-extrabold">{title}</p>
      <p className="mt-1 text-sm text-[var(--text-2)]">{body}</p>
      <Link to="/markets" className="mt-3 inline-block text-sm font-bold text-[var(--accent-dark)]">
        {hip4.positions.browse}
      </Link>
    </div>
  );
}

function OpenRow({
  item,
  onClose,
  closing,
}: {
  item: OutcomePosition;
  onClose: () => void;
  closing: boolean;
}) {
  const { hip4 } = useCopy();
  const showClose = canMarketClose(item);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-4">
      <Link to={`/market/${item.outcomeId}`} className="flex min-w-0 flex-1 items-center gap-3">
        <SideBadge side={item.side} name={item.sideName} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{item.title}</div>
          <div className="text-xs text-[var(--text-3)]">
            {item.avgCost != null && item.avgCost > 0
              ? interpolate(hip4.positions.sharesMetaAvg, {
                  shares: item.shares.toFixed(2),
                  cents: formatOutcomeCents(item.avgCost),
                  pct: impliedPercent(item.probability),
                })
              : interpolate(hip4.positions.sharesMeta, {
                  shares: item.shares.toFixed(2),
                  pct: impliedPercent(item.probability),
                })}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <RollingNumber
            value={item.valueUsd}
            format={(n) => `$${n.toFixed(2)}`}
            className="font-extrabold"
            durationMs={420}
          />
          {item.pnlUsd != null ? (
            <div
              className={`text-xs font-semibold ${item.pnlUsd >= 0 ? 'text-[var(--yes)]' : 'text-[var(--no)]'}`}
            >
              <RollingNumber
                value={item.pnlUsd}
                format={formatSignedUsd}
                className="font-semibold"
                durationMs={380}
              />
            </div>
          ) : null}
        </div>
      </Link>
      {showClose ? (
        <button
          type="button"
          disabled={closing}
          onClick={onClose}
          className="ml-5 shrink-0 rounded-lg bg-[#F43F5E18] px-2.5 py-1.5 text-[11px] font-extrabold leading-none text-[var(--danger)] transition hover:bg-[#F43F5E28] disabled:opacity-50"
        >
          {hip4.positions.close}
        </button>
      ) : null}
    </div>
  );
}

function OrderRow({
  item,
  markets,
  onCancel,
  pending,
}: {
  item: OutcomeOpenOrder;
  markets: ListedMarket[];
  onCancel: () => void;
  pending: boolean;
}) {
  const { hip4 } = useCopy();
  const buy = item.tradeSide === 'buy';
  const market = markets.find((m) => m.outcomeId === item.outcomeId);
  const sideName =
    market?.sides.find((s) => s.side === item.side)?.name ??
    (item.side === 0 ? hip4.yes : hip4.no);
  const title = market ? displayListedTitle(market) : `Prediction #${item.outcomeId}`;
  const ntl = item.sz * item.limitPx;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-4">
      <Link to={`/market/${item.outcomeId}`} className="flex min-w-0 flex-1 items-center gap-3">
        <TradeBadge buy={buy} label={buy ? hip4.ticket.buy : hip4.ticket.sell} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{title}</div>
          <div className="text-xs text-[var(--text-3)]">
            {interpolate(hip4.positions.orderMeta, {
              action: sideName,
              shares: Number.isInteger(item.sz) ? String(item.sz) : item.sz.toFixed(1),
              cents: Math.round(item.limitPx * 100),
            })}
          </div>
        </div>
        <div className="shrink-0 text-right font-extrabold tabular-nums">${ntl.toFixed(2)}</div>
      </Link>
      <button
        type="button"
        disabled={pending}
        onClick={onCancel}
        className="ml-5 shrink-0 rounded-lg bg-[#F43F5E18] px-2.5 py-1.5 text-[11px] font-extrabold leading-none text-[var(--danger)] transition hover:bg-[#F43F5E28] disabled:opacity-50"
      >
        {hip4.positions.cancelOrder}
      </button>
    </div>
  );
}

function HistoryList({
  rows,
  hidden,
  onShowMore,
}: {
  rows: Array<OutcomeClosedLot | OutcomeCancelledOrder>;
  hidden: number;
  onShowMore: () => void;
}) {
  const { hip4 } = useCopy();
  if (!rows.length) return <Empty title={hip4.positions.emptyHistory} body={hip4.positions.emptyHistoryBody} />;
  return (
    <>
      {rows.map((row) =>
        'kind' in row ? (
          <div key={`c-${row.oid}`} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-4">
            <TradeBadge buy={row.tradeSide === 'buy'} label={row.tradeSide === 'buy' ? hip4.ticket.buy : hip4.ticket.sell} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{row.title}</div>
              <div className="text-xs text-[var(--text-3)]">
                {interpolate(hip4.positions.orderMeta, {
                  action: row.sideName,
                  shares: Number.isInteger(row.sz) ? String(row.sz) : row.sz.toFixed(1),
                  cents: Math.round(row.limitPx * 100),
                })}
                {row.cancelledAt ? ` · ${formatWhen(row.cancelledAt)}` : ''}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs font-bold text-[var(--text-3)]">
              {row.reason === 'marketEnded' ? hip4.positions.cancelledMarketEnded : hip4.positions.cancelled}
            </div>
          </div>
        ) : (
          <div key={row.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-4">
            <SideBadge side={row.side} name={row.sideName} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{row.title}</div>
              <div className="text-xs text-[var(--text-3)]">
                {row.settled
                  ? hip4.positions.settled
                  : row.fullyClosed
                    ? hip4.positions.closed
                    : hip4.positions.sold}{' '}
                {row.shares.toFixed(0)} · {Math.round(row.exitPx * 100)}¢
                {row.closedAt ? ` · ${formatWhen(row.closedAt)}` : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="font-extrabold tabular-nums">${row.proceedsUsd.toFixed(2)}</div>
              <div
                className={`text-xs font-semibold ${row.pnlUsd >= 0 ? 'text-[var(--yes)]' : 'text-[var(--no)]'}`}
              >
                {formatSignedUsd(row.pnlUsd)}
              </div>
            </div>
          </div>
        ),
      )}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={onShowMore}
          className="rounded-2xl border border-[var(--border)] bg-white py-3 text-sm font-extrabold text-[var(--accent-dark)]"
        >
          {interpolate(hip4.home.showMore, { count: hidden })}
        </button>
      ) : null}
    </>
  );
}
