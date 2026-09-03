import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { colors, getPriceChangeColor } from '../src/theme/colors';
import {
  applySettledOutcomeLabels,
  fetchSpotClearinghouse,
  fetchOutcomeFills,
  closedLotsFromFills,
  fetchSettledOutcomeLabels,
  fetchHlAllTimePnl,
  formatOutcomeCents,
  impliedPercent,
  HIP4_CATALOG_STALE_MS,
  HIP4_CATALOG_POLL_MS,
  HIP4_POSITIONS_MIDS_POLL_MS,
  listOutcomes,
  fetchAllMids,
  overlayListedMids,
  netPnlUsd,
  outcomeIdsNeedingSettledLabels,
  outcomeRealizedPnlFromFills,
  outcomeVolumeFromFills,
  positionsFromSpotBalances,
  fetchOutcomeOpenOrders,
  fetchOutcomeCancelledOrders,
  cancelOutcomeOrder,
  displayListedTitle,
  outcomeSpotCoin,
  Hip4Error,
  placeOutcomeOrder,
  releaseOutcomeSellHolds,
  parseSideCoin,
  type Hex,
  type ListedMarket,
  type OutcomeCancelledOrder,
  type OutcomeClosedLot,
  type OutcomeOpenOrder,
  type OutcomePosition,
  type OutcomeSide,
} from '../src/lib/hip4';
import { useAppStore } from '../src/store/appStore';
import { useHyperliquidSpotState } from '../src/lib/useHyperliquidAccountStream';
import { pushRouteOnce } from '../src/lib/pushRouteOnce';
import { YES_COLOR, NO_COLOR } from '../src/components/sports/OddsPill';
import { RollingNumber } from '../src/components/RollingNumber';
import { humanizeHyperliquidError } from '../src/lib/hyperliquidErrors';
import { showErrorToast } from '../src/lib/toast';
import { PositionsHistorySkeleton } from '../src/components/skeleton/PositionsHistorySkeleton';
import { useDisplayCurrency } from '../src/providers/CurrencyProvider';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  OrderTicketModal,
  type OrderTicketPayload,
} from '../src/components/sports/OrderTicketModal';

type MoneyFmt = {
  price: (n: number | null | undefined) => string;
  signed: (n: number) => string;
};

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

function historyTime(row: OutcomeClosedLot | OutcomeCancelledOrder): number {
  return isCancelledRow(row) ? row.cancelledAt : row.closedAt;
}

function isCancelledRow(
  item: OutcomePosition | OutcomeClosedLot | OutcomeOpenOrder | OutcomeCancelledOrder,
): item is OutcomeCancelledOrder {
  return 'kind' in item && item.kind === 'cancelled';
}

function isOpenOrderRow(
  item: OutcomePosition | OutcomeClosedLot | OutcomeOpenOrder | OutcomeCancelledOrder,
): item is OutcomeOpenOrder {
  return 'oid' in item && !('kind' in item);
}

function formatClosedAt(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderOpen(
  item: OutcomePosition,
  router: { push: (href: never) => void },
  t: TFunction,
  money: MoneyFmt,
  onClose: () => void,
  closing: boolean,
) {
  const tone = item.side === 0 ? YES_COLOR : NO_COLOR;
  const showClose = canMarketClose(item);
  const goMarket = () => router.push(`/market/${item.outcomeId}` as never);
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.rowMain} onPress={goMarket} activeOpacity={0.8}>
        <View style={[styles.badge, { backgroundColor: `${tone}22` }]}>
          <Text style={[styles.badgeText, { color: tone }]}>{item.sideName}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.rowMeta}>
            {item.avgCost != null && item.avgCost > 0
              ? t('hip4.positions.sharesMetaAvg', {
                  shares: item.shares.toFixed(2),
                  cents: formatOutcomeCents(item.avgCost),
                  pct: impliedPercent(item.probability),
                })
              : t('hip4.positions.sharesMeta', {
                  shares: item.shares.toFixed(2),
                  pct: impliedPercent(item.probability),
                })}
          </Text>
        </View>
      </TouchableOpacity>
      <View style={styles.rowValCol}>
        <TouchableOpacity onPress={goMarket} activeOpacity={0.8}>
          <RollingNumber
            value={item.valueUsd}
            format={(n) => money.price(n)}
            align="right"
            durationMs={480}
            style={styles.rowVal}
          />
          {item.pnlUsd != null ? (
            <RollingNumber
              value={item.pnlUsd}
              format={money.signed}
              align="right"
              durationMs={420}
              style={[styles.rowPnl, { color: getPriceChangeColor(item.pnlUsd) }]}
            />
          ) : null}
        </TouchableOpacity>
        {showClose ? (
          <TouchableOpacity
            onPress={onClose}
            disabled={closing}
            hitSlop={8}
            style={styles.closeChip}
            accessibilityRole="button"
            accessibilityLabel={t('hip4.positions.close')}
          >
            {closing ? (
              <ActivityIndicator size="small" color={colors.status.error} />
            ) : (
              <Text style={styles.closeChipText}>{t('hip4.positions.close')}</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function renderClosed(item: OutcomeClosedLot, t: TFunction, money: MoneyFmt) {
  const tone = item.side === 0 ? YES_COLOR : NO_COLOR;
  return (
    <View style={styles.row}>
      <View style={[styles.badge, { backgroundColor: `${tone}22` }]}>
        <Text style={[styles.badgeText, { color: tone }]}>{item.sideName}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.rowMeta}>
          {item.settled
            ? t('hip4.positions.settled')
            : item.fullyClosed
              ? t('hip4.positions.closed')
              : t('hip4.positions.sold')}{' '}
          {item.shares.toFixed(0)} · {Math.round(item.exitPx * 100)}¢
          {item.closedAt ? ` · ${formatClosedAt(item.closedAt)}` : ''}
        </Text>
      </View>
      <View style={styles.rowValCol}>
        <Text style={styles.rowVal}>{money.price(item.proceedsUsd)}</Text>
        <Text style={[styles.rowPnl, { color: getPriceChangeColor(item.pnlUsd) }]}>
          {money.signed(item.pnlUsd)}
        </Text>
      </View>
    </View>
  );
}

function renderCancelled(item: OutcomeCancelledOrder, t: TFunction) {
  const tone = item.tradeSide === 'sell' ? colors.status.error : YES_COLOR;
  const reason =
    item.reason === 'marketEnded'
      ? t('hip4.positions.cancelledMarketEnded')
      : t('hip4.positions.cancelled');
  return (
    <View style={styles.row}>
      <View style={[styles.badge, { backgroundColor: `${tone}22` }]}>
        <Text style={[styles.badgeText, { color: tone }]}>
          {item.tradeSide === 'sell' ? t('hip4.ticket.sell') : t('hip4.ticket.buy')}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.rowMeta}>
          {t('hip4.positions.orderMeta', {
            action: item.sideName,
            shares: Number.isInteger(item.sz) ? String(item.sz) : item.sz.toFixed(1),
            cents: Math.round(item.limitPx * 100),
          })}
          {item.cancelledAt ? ` · ${formatClosedAt(item.cancelledAt)}` : ''}
        </Text>
      </View>
      <View style={styles.rowValCol}>
        <Text style={styles.rowPnlMuted}>{reason}</Text>
      </View>
    </View>
  );
}

function renderOrder(
  item: OutcomeOpenOrder,
  markets: ListedMarket[],
  router: { push: (href: never) => void },
  t: TFunction,
  cancelling: boolean,
  onCancel: () => void,
  money: MoneyFmt,
) {
  const tone = item.tradeSide === 'sell' ? colors.status.error : YES_COLOR;
  const market = markets.find((m) => m.outcomeId === item.outcomeId);
  const sideName =
    market?.sides.find((s) => s.side === item.side)?.name ??
    (item.side === 0 ? t('hip4.yes') : t('hip4.no'));
  const title = market ? displayListedTitle(market) : `Prediction #${item.outcomeId}`;
  const ntl = item.sz * item.limitPx;
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.rowMain}
        onPress={() => router.push(`/market/${item.outcomeId}` as never)}
        activeOpacity={0.8}
      >
        <View style={[styles.badge, { backgroundColor: `${tone}22` }]}>
          <Text style={[styles.badgeText, { color: tone }]}>
            {item.tradeSide === 'sell' ? t('hip4.ticket.sell') : t('hip4.ticket.buy')}
          </Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.rowMeta}>
            {t('hip4.positions.orderMeta', {
              action: sideName,
              shares: Number.isInteger(item.sz) ? String(item.sz) : item.sz.toFixed(1),
              cents: Math.round(item.limitPx * 100),
            })}
          </Text>
        </View>
        <Text style={styles.rowVal}>{money.price(ntl)}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onCancel}
        disabled={cancelling}
        hitSlop={8}
        style={[styles.closeChip, { marginTop: 0 }]}
      >
        {cancelling ? (
          <ActivityIndicator size="small" color={colors.status.error} />
        ) : (
          <Text style={styles.closeChipText}>{t('hip4.positions.cancelOrder')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function PositionsScreen() {
  const { t } = useTranslation();
  const { formatDisplayPrice, formatDisplaySigned, formatDisplayVolume, isConverted, currency } =
    useDisplayCurrency();
  const money: MoneyFmt = {
    price: formatDisplayPrice,
    signed: formatDisplaySigned,
  };
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const address = useAppStore((s) => (s.user?.wallet?.address ?? null) as Hex | null);
  const focused = useIsFocused();
  const spotState = useHyperliquidSpotState();
  const [tab, setTab] = useState<'open' | 'orders' | 'history'>('open');
  const [historyShowAll, setHistoryShowAll] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [cancellingOid, setCancellingOid] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<{
    phase: 'confirm' | 'receipt' | 'error';
    payload: OrderTicketPayload;
    status?: 'filled' | 'resting' | 'unknown';
    error?: { title: string; message: string };
    outcomeId: number;
    side: OutcomeSide;
  } | null>(null);

  const marketsQuery = useQuery({
    queryKey: ['hip4', 'outcomes', 'all'],
    queryFn: () => listOutcomes({ filter: 'all' }),
    staleTime: HIP4_CATALOG_STALE_MS,
    refetchInterval: focused ? HIP4_CATALOG_POLL_MS : false,
  });

  const restBalancesQuery = useQuery({
    queryKey: ['hip4', 'spot', address],
    queryFn: () => fetchSpotClearinghouse(address as Hex),
    enabled: !!address && isAuthenticated,
    staleTime: 6_000,
    refetchInterval: focused ? 12_000 : false,
  });

  const fillsQuery = useQuery({
    queryKey: ['hip4', 'fills', address],
    queryFn: () => fetchOutcomeFills(address as Hex),
    enabled: !!address && isAuthenticated && focused,
    staleTime: 30_000,
    refetchInterval: focused ? 30_000 : false,
  });

  const pnlQuery = useQuery({
    queryKey: ['hip4', 'hl-pnl', address],
    queryFn: () => fetchHlAllTimePnl(address as Hex),
    enabled: !!address && isAuthenticated && focused,
    staleTime: 60_000,
    refetchInterval: focused ? 60_000 : false,
  });

  const ordersQuery = useQuery({
    queryKey: ['hip4', 'open-orders', address],
    queryFn: () => fetchOutcomeOpenOrders(address as Hex),
    enabled: !!address && isAuthenticated && focused,
    staleTime: 4_000,
    refetchInterval: focused ? 8_000 : false,
  });

  const cancelledQuery = useQuery({
    queryKey: ['hip4', 'historical-cancels', address],
    queryFn: async () => {
      try {
        return await fetchOutcomeCancelledOrders(address as Hex);
      } catch {
        return [];
      }
    },
    enabled: !!address && isAuthenticated && focused,
    staleTime: 30_000,
  });

  const streamBalances = useMemo(() => {
    const raw = spotState?.balances;
    return Array.isArray(raw) ? raw : null;
  }, [spotState]);

  const restBalances = restBalancesQuery.data?.balances ?? [];

  const balances = useMemo(() => {
    if (!streamBalances) return restBalances;
    const costByCoin = new Map<string, number>();
    for (const row of restBalances) {
      const coin = String(row.coin ?? row.token ?? '');
      const ntl = Number(row.entryNtl);
      if (coin && Number.isFinite(ntl) && ntl > 0) costByCoin.set(coin, ntl);
    }
    return streamBalances.map((row) => {
      const coin = String(row.coin ?? row.token ?? '');
      const live = Number(row.entryNtl);
      if (Number.isFinite(live) && live > 0) return row;
      const fallback = costByCoin.get(coin);
      return fallback != null ? { ...row, entryNtl: fallback } : row;
    });
  }, [streamBalances, restBalances]);

  const hasOutcomeHoldings = useMemo(
    () =>
      balances.some((b) => {
        const parsed = parseSideCoin(String(b.coin ?? b.token ?? ''));
        return !!parsed && (Number(b.total) || 0) > 0;
      }),
    [balances],
  );

  const liveMidsQuery = useQuery({
    queryKey: ['hip4', 'allMids'],
    queryFn: () => fetchAllMids(true),
    enabled: focused && isAuthenticated && tab === 'open' && hasOutcomeHoldings,
    staleTime: 4_000,
    refetchInterval:
      focused && tab === 'open' && hasOutcomeHoldings ? HIP4_POSITIONS_MIDS_POLL_MS : false,
  });

  const missingTitleIds = useMemo(
    () =>
      outcomeIdsNeedingSettledLabels(
        fillsQuery.data ?? [],
        marketsQuery.data ?? [],
        [
          ...balances.map((b) => String(b.coin ?? b.token ?? '')),
          ...(cancelledQuery.data ?? []).map((o) => outcomeSpotCoin(o.outcomeId, o.side)),
        ],
      ),
    [fillsQuery.data, marketsQuery.data, balances, cancelledQuery.data],
  );

  const settledTitlesQuery = useQuery({
    queryKey: ['hip4', 'settled-titles', missingTitleIds.join(',')],
    queryFn: () => fetchSettledOutcomeLabels(missingTitleIds),
    enabled: missingTitleIds.length > 0,
    staleTime: 15 * 60_000,
  });

  const onPullRefresh = async () => {
    setPullRefreshing(true);
    try {
      await Promise.all([
        marketsQuery.refetch(),
        restBalancesQuery.refetch(),
        ordersQuery.refetch(),
        fillsQuery.refetch(),
        pnlQuery.refetch(),
        liveMidsQuery.refetch(),
        tab === 'history' ? cancelledQuery.refetch() : Promise.resolve(),
        settledTitlesQuery.refetch(),
      ]);
    } finally {
      setPullRefreshing(false);
    }
  };

  const catalogMarkets = useMemo(
    () => overlayListedMids(marketsQuery.data ?? [], liveMidsQuery.data),
    [marketsQuery.data, liveMidsQuery.data],
  );

  const positions = useMemo(
    () =>
      applySettledOutcomeLabels(
        positionsFromSpotBalances(balances, catalogMarkets),
        settledTitlesQuery.data,
      ),
    [catalogMarkets, balances, settledTitlesQuery.data],
  );

  const closed = useMemo(
    () =>
      applySettledOutcomeLabels(
        closedLotsFromFills(fillsQuery.data ?? [], catalogMarkets),
        settledTitlesQuery.data,
      ),
    [fillsQuery.data, catalogMarkets, settledTitlesQuery.data],
  );

  const cancelled = useMemo(() => {
    const markets = catalogMarkets;
    const labeled = (cancelledQuery.data ?? []).map((row) => {
      const market = markets.find((m) => m.outcomeId === row.outcomeId);
      if (!market) return row;
      const sideMeta = market.sides.find((s) => s.side === row.side);
      return {
        ...row,
        title: displayListedTitle(market),
        sideName: sideMeta?.name ?? row.sideName,
      };
    });
    return applySettledOutcomeLabels(labeled, settledTitlesQuery.data);
  }, [cancelledQuery.data, catalogMarkets, settledTitlesQuery.data]);

  const history = useMemo(() => {
    const rows: Array<OutcomeClosedLot | OutcomeCancelledOrder> = [...closed, ...cancelled];
    return rows.sort((a, b) => historyTime(b) - historyTime(a));
  }, [closed, cancelled]);

  const orders = ordersQuery.data ?? [];
  const total = positions.reduce((sum, p) => sum + p.valueUsd, 0);
  const unrealizedPnl = positions.reduce(
    (sum, p) => (p.pnlUsd != null ? sum + p.pnlUsd : sum),
    0,
  );
  const realizedPnl = outcomeRealizedPnlFromFills(fillsQuery.data ?? []);
  const volumeUsd = outcomeVolumeFromFills(fillsQuery.data ?? []);
  const netPnl = netPnlUsd(pnlQuery.data, unrealizedPnl, realizedPnl);

  const liveClosePayload = useMemo((): OrderTicketPayload | null => {
    if (!ticket) return null;
    if (ticket.phase !== 'confirm' || busy) return ticket.payload;
    const live = positions.find(
      (p) => p.outcomeId === ticket.outcomeId && p.side === ticket.side,
    );
    if (!live || !canMarketClose(live)) return ticket.payload;
    return closeTicketPayload(live);
  }, [ticket, busy, positions]);

  const openClose = (item: OutcomePosition) => {
    if (busy || ticket) return;
    if (!canMarketClose(item)) return;
    const px = item.probability;
    if (px == null || !(px > 0)) {
      showErrorToast(t('hip4.ticket.noLivePrice'), t('hip4.ticket.errPrice'));
      return;
    }
    setTicket({
      phase: 'confirm',
      outcomeId: item.outcomeId,
      side: item.side,
      payload: closeTicketPayload(item),
    });
    void Haptics.selectionAsync();
  };

  const placeClose = async () => {
    if (!ticket || ticket.phase !== 'confirm' || busy) return;
    const quote = liveClosePayload ?? ticket.payload;
    const px = quote.px;
    const shares = quote.shares;
    if (px == null || !(px > 0) || shares < 1) {
      showErrorToast(t('hip4.ticket.priceMoved'), t('hip4.ticket.errPrice'));
      return;
    }
    const frozen: OrderTicketPayload = {
      ...quote,
      shares,
      usd: shares * px,
      closingAll: true,
    };
    setTicket({ ...ticket, payload: frozen });
    setBusy(true);
    try {
      let sizeShares = shares;
      if (address) {
        sizeShares = await releaseOutcomeSellHolds({
          user: address as Hex,
          outcomeId: ticket.outcomeId,
          side: ticket.side,
        });
        void queryClient.invalidateQueries({ queryKey: ['hip4', 'open-orders'] });
      }
      if (!(sizeShares >= 1)) {
        throw new Hip4Error(t('hip4.ticket.noFreeShares'));
      }
      const result = await placeOutcomeOrder({
        outcomeId: ticket.outcomeId,
        side: ticket.side,
        tradeSide: 'sell',
        sizeUsd: sizeShares * px,
        sizeShares,
        skipMinNotional: true,
        orderType: 'market',
        referencePx: px,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const filled =
        result.filledShares != null && result.filledShares > 0 ? result.filledShares : sizeShares;
      const avg = result.avgPx != null && result.avgPx > 0 ? result.avgPx : px;
      const usd = result.status === 'filled' && avg != null ? filled * avg : frozen.usd;
      setTicket({
        ...ticket,
        phase: 'receipt',
        status: result.status,
        payload: { ...frozen, shares: filled, usd, px: avg },
      });
      queryClient.invalidateQueries({ queryKey: ['hip4', 'spot'] });
      queryClient.invalidateQueries({ queryKey: ['hip4', 'open-orders'] });
      queryClient.invalidateQueries({ queryKey: ['hip4', 'fills'] });
      queryClient.invalidateQueries({ queryKey: ['hip4', 'historical-cancels'], refetchType: 'none' });
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const raw = err instanceof Hip4Error ? err.raw : err instanceof Error ? err.message : String(err);
      const nice = humanizeHyperliquidError(raw);
      setTicket((cur) =>
        cur ? { ...cur, phase: 'error', error: { title: nice.title, message: nice.message } } : cur,
      );
    } finally {
      setBusy(false);
    }
  };

  const cancelOpen = async (order: OutcomeOpenOrder) => {
    if (cancellingOid != null) return;
    setCancellingOid(order.oid);
    try {
      await cancelOutcomeOrder(order);
      if (address) {
        queryClient.setQueryData(
          ['hip4', 'open-orders', address],
          (prev: OutcomeOpenOrder[] | undefined) => (prev ?? []).filter((o) => o.oid !== order.oid),
        );
        const row: OutcomeCancelledOrder = {
          kind: 'cancelled',
          oid: order.oid,
          outcomeId: order.outcomeId,
          side: order.side,
          tradeSide: order.tradeSide,
          limitPx: order.limitPx,
          sz: order.sz,
          title: `Prediction #${order.outcomeId}`,
          sideName: order.side === 0 ? 'Yes' : 'No',
          reason: 'canceled',
          cancelledAt: Date.now(),
        };
        queryClient.setQueryData(
          ['hip4', 'historical-cancels', address],
          (prev: OutcomeCancelledOrder[] | undefined) => {
            const list = prev ?? [];
            if (list.some((o) => o.oid === order.oid)) return list;
            return [row, ...list];
          },
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['hip4', 'open-orders'] });
      queryClient.invalidateQueries({ queryKey: ['hip4', 'historical-cancels'], refetchType: 'none' });
    } catch (err) {
      const raw = err instanceof Hip4Error ? err.raw : err instanceof Error ? err.message : String(err);
      const nice = humanizeHyperliquidError(raw);
      showErrorToast(nice.message, nice.title);
    } finally {
      setCancellingOid(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.wrap}>
          <Text style={styles.title}>{t('hip4.positions.title')}</Text>
          <Text style={styles.body}>{t('hip4.positions.signInBody')}</Text>
          <TouchableOpacity style={styles.cta} onPress={() => pushRouteOnce(router, '/login')}>
            <Text style={styles.ctaLabel}>{t('hip4.positions.logIn')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const initialLoad =
    (marketsQuery.isLoading || restBalancesQuery.isLoading) &&
    !marketsQuery.data &&
    !restBalancesQuery.data &&
    positions.length === 0;

  const historyLoading =
    (fillsQuery.isPending && !fillsQuery.data) ||
    ((cancelledQuery.isPending && !cancelledQuery.data) &&
      !(fillsQuery.data && fillsQuery.data.length));
  const ordersLoading = ordersQuery.isPending && orders.length === 0;
  const hint =
    tab === 'open'
      ? t('hip4.positions.openHint')
      : tab === 'orders'
        ? t('hip4.positions.ordersHint')
        : t('hip4.positions.historyHint');
  const listLoading =
    tab === 'open' ? initialLoad : tab === 'orders' ? ordersLoading : historyLoading;
  const visibleHistory = historyShowAll ? history : history.slice(0, HISTORY_CAP);
  const historyHidden = Math.max(0, history.length - visibleHistory.length);
  const listData =
    tab === 'open'
      ? initialLoad
        ? []
        : positions
      : tab === 'orders'
        ? ordersLoading
          ? []
          : orders
        : historyLoading
          ? []
          : visibleHistory;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('hip4.positions.title')}</Text>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t('hip4.positions.statOpen')}</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {formatDisplayPrice(total)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t('hip4.positions.statPnl')}</Text>
            <Text
              style={[styles.statValue, { color: getPriceChangeColor(netPnl) }]}
              numberOfLines={1}
            >
              {formatDisplaySigned(netPnl)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{t('hip4.positions.statVolume')}</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {(() => {
                const v = formatDisplayVolume(volumeUsd);
                if (v === '--') return v;
                return isConverted ? `≈ ${v}` : v;
              })()}
            </Text>
          </View>
        </View>
        <Text style={styles.hint} numberOfLines={1}>
          {hint}
        </Text>
        <View style={styles.tabs}>
          {(['open', 'orders', 'history'] as const).map((id, i, all) => {
            const on = tab === id;
            const label =
              id === 'open'
                ? t('hip4.positions.tabOpen')
                : id === 'orders'
                  ? t('hip4.positions.tabOrders')
                  : t('hip4.positions.tabHistory');
            const count =
              id === 'open'
                ? initialLoad
                  ? 0
                  : positions.length
                : id === 'orders'
                  ? ordersLoading
                    ? 0
                    : orders.length
                  : 0;
            const tabText = count > 0 ? `${label} (${count})` : label;
            const prev = i > 0 ? all[i - 1] : null;
            return (
              <React.Fragment key={id}>
                {prev ? (
                  <View
                    pointerEvents="none"
                    style={[styles.tabSep, (on || tab === prev) && styles.tabSepHidden]}
                  />
                ) : null}
                <TouchableOpacity
                  style={[styles.tab, on && styles.tabOn]}
                  onPress={() => setTab(id)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[styles.tabLabel, on && styles.tabLabelOn]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                  >
                    {tabText}
                  </Text>
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>
      </View>

      <FlashList
        data={listData as Array<OutcomePosition | OutcomeClosedLot | OutcomeOpenOrder | OutcomeCancelledOrder>}
        style={styles.flex}
        extraData={`${tab}:${currency}:${historyShowAll}:${settledTitlesQuery.dataUpdatedAt}:${cancellingOid}:${ordersQuery.dataUpdatedAt}:${cancelledQuery.dataUpdatedAt}:${liveMidsQuery.dataUpdatedAt}:${ticket?.outcomeId ?? ''}:${ticket?.side ?? ''}:${busy}`}
        keyExtractor={(item) =>
          isCancelledRow(item)
            ? `cancel:${item.oid}`
            : isOpenOrderRow(item)
              ? `order:${item.oid}`
              : 'fullyClosed' in item
                ? `closed:${item.id}`
                : `open:${item.outcomeId}:${item.side}`
        }
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={onPullRefresh}
            tintColor={colors.accent.gold}
          />
        }
        ListEmptyComponent={
          listLoading ? (
            <PositionsHistorySkeleton />
          ) : (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>
                {tab === 'open'
                  ? t('hip4.positions.emptyOpen')
                  : tab === 'orders'
                    ? t('hip4.positions.emptyOrders')
                    : t('hip4.positions.emptyHistory')}
              </Text>
              <Text style={styles.body}>
                {tab === 'open'
                  ? t('hip4.positions.emptyOpenBody')
                  : tab === 'orders'
                    ? t('hip4.positions.emptyOrdersBody')
                    : t('hip4.positions.emptyHistoryBody')}
              </Text>
              {tab === 'open' ? (
                <TouchableOpacity style={styles.cta} onPress={() => router.replace('/markets' as never)}>
                  <Text style={styles.ctaLabel}>{t('hip4.positions.browse')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )
        }
        ListFooterComponent={
          tab === 'history' && !listLoading && historyHidden > 0 ? (
            <TouchableOpacity
              style={styles.showMore}
              onPress={() => setHistoryShowAll(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.showMoreLabel}>
                {t('hip4.home.showMore', { count: historyHidden })}
              </Text>
            </TouchableOpacity>
          ) : null
        }
        renderItem={({ item }) =>
          isCancelledRow(item)
            ? renderCancelled(item, t)
            : isOpenOrderRow(item)
              ? renderOrder(item, marketsQuery.data ?? [], router, t, cancellingOid === item.oid, () => {
                  void cancelOpen(item);
                }, money)
              : 'fullyClosed' in item
                ? renderClosed(item, t, money)
                : renderOpen(
                    item,
                    router,
                    t,
                    money,
                    () => openClose(item),
                    !!(
                      busy &&
                      ticket?.outcomeId === item.outcomeId &&
                      ticket.side === item.side
                    ),
                  )
        }
      />
      <OrderTicketModal
        visible={!!ticket}
        phase={ticket?.phase ?? 'confirm'}
        payload={liveClosePayload}
        status={ticket?.status}
        error={ticket?.error}
        busy={busy}
        livePrice={ticket?.phase === 'confirm' && !busy}
        onConfirm={() => {
          void placeClose();
        }}
        onClose={() => {
          if (busy) return;
          setTicket(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background.primary },
  flex: { flex: 1, minHeight: 0 },
  wrap: { flex: 1, paddingHorizontal: 24, paddingTop: 32, gap: 12 },
  head: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  title: { color: colors.text.primary, fontSize: 32, fontWeight: '800', marginTop: 2 },
  stats: {
    flexDirection: 'row',
    marginTop: 14,
    backgroundColor: colors.background.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.primary,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  stat: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  statLabel: {
    color: colors.text.tertiary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statValue: { color: colors.text.primary, fontSize: 18, fontWeight: '800', marginTop: 4 },
  hint: { color: colors.text.tertiary, fontSize: 13, marginTop: 10, minHeight: 17 },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: 3,
  },
  tabSep: {
    width: StyleSheet.hairlineWidth,
    height: 14,
    backgroundColor: colors.border.accent,
  },
  tabSepHidden: { opacity: 0 },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 10,
    minWidth: 0,
  },
  tabOn: { backgroundColor: colors.background.card },
  tabLabel: {
    color: colors.text.tertiary,
    fontSize: 11,
    fontWeight: '700',
    width: '100%',
    textAlign: 'center',
  },
  tabLabelOn: { color: colors.text.primary },
  body: { color: colors.text.secondary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 108 },
  center: { paddingHorizontal: 28, paddingTop: 16, alignItems: 'center', gap: 10 },
  emptyTitle: { color: colors.text.primary, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.background.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: 14,
    marginBottom: 10,
  },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text.primary, fontSize: 15, fontWeight: '700' },
  rowMeta: { color: colors.text.tertiary, fontSize: 12, marginTop: 3 },
  rowValCol: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 72 },
  rowVal: { color: colors.text.primary, fontWeight: '800', fontSize: 16 },
  rowPnl: { fontWeight: '700', fontSize: 12, marginTop: 2 },
  closeChip: {
    marginTop: 6,
    minHeight: 22,
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#F43F5E18',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  closeChipText: {
    color: colors.status.error,
    fontWeight: '800',
    fontSize: 11,
  },
  rowPnlMuted: { fontWeight: '700', fontSize: 12, color: colors.text.tertiary, textAlign: 'right' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  showMore: {
    marginTop: 4,
    marginBottom: 8,
    alignSelf: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.card,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  showMoreLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.accent.goldDark,
    textAlign: 'center',
  },
  cta: {
    marginTop: 8,
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ctaLabel: { color: colors.text.primary, fontWeight: '700' },
});
