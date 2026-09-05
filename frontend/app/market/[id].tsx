import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../src/theme/colors';
import { fonts } from '../../src/theme/fonts';
import {
  CANDLE_INTERVAL_MS,
  CHART_RANGES,
  fetchLegCandleSamples,
  HIP4_CATALOG_POLL_MS,
  HIP4_CATALOG_STALE_MS,
  listOutcomes,
  placeOutcomeOrder,
  questionSiblings,
  questionOutcomeIds,
  Hip4Error,
  MIN_OUTCOME_NOTIONAL_USD,
  outcomeSharesForUsd,
  outcomeSellSharesForUsd,
  fetchSpotClearinghouse,
  positionsFromSpotBalances,
  spotUsdcAvailable,
  outcomeFreeShares,
  releaseOutcomeSellHolds,
  fetchOutcomeBook,
  estimateBookFill,
  estimateBuyPayout,
  estimateSellPayout,
  formatOutcomeCents,
  fetchOutcomeOpenOrders,
  cancelOutcomeOrder,
  pairedRedeemShares,
  questionRedeemShares,
  redeemOutcomePair,
  redeemQuestionBundle,
  isOutcomeRailPx,
  impliedPercent,
  type Hex,
  type OutcomeCandleInterval,
  type OutcomePrint,
  type OutcomeSide,
} from '../../src/lib/hip4';
import { useOutcomeMarketStream, type StreamLeg } from '../../src/lib/useOutcomeMarketStream';
import { humanizeHyperliquidError } from '../../src/lib/hyperliquidErrors';
import { OddsPill, YES_COLOR, NO_COLOR, LEG_PALETTE } from '../../src/components/sports/OddsPill';
import { ProbabilityChart, type ProbSeries } from '../../src/components/sports/ProbabilityLine';
// import type { ChartTick } from '../../src/components/sports/ChartTradeTicks';
import { MarketActivityTabs } from '../../src/components/sports/MarketActivityTabs';
import { MarketSymbol } from '../../src/components/sports/MarketSymbol';
import { OrderTicketModal, type OrderTicketPayload } from '../../src/components/sports/OrderTicketModal';
import { ConfirmModal } from '../../src/components/ConfirmModal';
import { RollingNumber } from '../../src/components/RollingNumber';
import { CurrencyHint } from '../../src/components/CurrencyHint';
import { showErrorToast } from '../../src/lib/toast';
import { useAppStore } from '../../src/store/appStore';
import { useSeamlessSetup } from '../../src/providers/SeamlessSetupProvider';
import { useHyperliquidSpotState } from '../../src/lib/useHyperliquidAccountStream';
import { pushRouteOnce, navigateRouteOnce } from '../../src/lib/pushRouteOnce';
import { useTranslation } from 'react-i18next';
import { useBuilderConfig } from '../../src/providers/BuilderConfigProvider';

const QUICK = [10, 25, 50, 100];

function looksLikePipeMeta(s: string): boolean {
  return /\|/.test(s) && /[a-z]+:/i.test(s);
}

function formatHms(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

function MarketCountdown({
  statusLabel,
  startsAt,
  expiresAt,
}: {
  statusLabel: string;
  startsAt: number | null;
  expiresAt: number | null;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startsAt == null && expiresAt == null) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [startsAt, expiresAt]);
  const target =
    startsAt != null && startsAt > now
      ? { at: startsAt, kind: 'starts' as const }
      : expiresAt != null && expiresAt > now
        ? { at: expiresAt, kind: 'ends' as const }
        : null;
  const remainSec = target ? Math.max(0, Math.ceil((target.at - now) / 1000)) : null;
  return (
    <View style={styles.kickerRow}>
      <Text style={styles.kicker}>{statusLabel}</Text>
      {remainSec != null && target ? (
        <>
          <Text style={styles.kickerSep}>·</Text>
          <View style={styles.kickerClockWrap}>
            <RollingNumber
              value={remainSec}
              format={formatHms}
              durationMs={280}
              align="left"
              style={styles.kickerClock}
            />
          </View>
          <Text style={styles.kickerCountLabel}>
            {target.kind === 'starts' ? t('hip4.status.startsIn') : t('hip4.status.endsIn')}
          </Text>
        </>
      ) : null}
    </View>
  );
}

export default function MarketScreen() {
  const { t } = useTranslation();
  const { builderFeeRate } = useBuilderConfig();
  const sellFeeLabel =
    Number.isFinite(builderFeeRate) && builderFeeRate > 0
      ? `${(builderFeeRate * 100).toFixed(3)}%`
      : t('fees.free');
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const address = useAppStore((s) => (s.user?.wallet?.address ?? null) as Hex | null);
  const { setupComplete, requestExternalSetup, isExternalWalletUser } = useSeamlessSetup();
  const focused = useIsFocused();
  const spotState = useHyperliquidSpotState();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [rangeId, setRangeId] = useState<OutcomeCandleInterval>('15m');
  const [size, setSize] = useState('0');
  const [sizeEditing, setSizeEditing] = useState(false);
  /** Max sell: send every held share at the bid. Do not re-convert a frozen USD through a new mid. */
  const [sellAll, setSellAll] = useState(false);
  const [ticketAction, setTicketAction] = useState<'buy' | 'sell'>('buy');
  const [fillMode, setFillMode] = useState<'now' | 'wait'>('now');
  const [modeOpen, setModeOpen] = useState(false);
  const [waitCents, setWaitCents] = useState(50);
  const [waitDraft, setWaitDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy' | 'sell' | 'cancel' | 'redeem' | null>(null);
  const [ticket, setTicket] = useState<{
    phase: 'confirm' | 'receipt' | 'error';
    payload: OrderTicketPayload;
    status?: 'filled' | 'resting' | 'unknown';
    error?: { title: string; message: string };
    outcomeId: number;
    side: OutcomeSide;
    /** Original USDC size the user typed — shares reprice off this while the ticket is open. */
    sizeUsd: number;
    orderType: 'market' | 'limit';
    limitPx?: number;
  } | null>(null);
  const [redeemAsk, setRedeemAsk] = useState<'pair' | 'question' | null>(null);
  // Live chart trade bubbles (ChartTradeTicks). Off — uncomment with the overlay in ProbabilityLine.
  // const [ticks, setTicks] = useState<ChartTick[]>([]);
  const seenLive = useRef(new Set<string>());
  const ticksArmed = useRef(false);
  const frozenSeries = useRef<ProbSeries[]>([]);

  const catalogQuery = useQuery({
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
  });

  const catalog = catalogQuery.data ?? [];
  const market = useMemo(() => {
    if (id === 'demo') return catalog[0] ?? null;
    return catalog.find((m) => m.id === String(id) || String(m.outcomeId) === String(id)) ?? null;
  }, [catalog, id]);

  const siblings = useMemo(() => (market ? questionSiblings(catalog, market) : []), [catalog, market]);
  const multiLeg = siblings.length > 1;

  const streamLegs: StreamLeg[] = useMemo(() => {
    if (!market) return [];
    if (multiLeg) {
      return siblings.map((m) => ({
        key: `${m.outcomeId}:0`,
        outcomeId: m.outcomeId,
        side: 0 as OutcomeSide,
        seed: m.sides.find((s) => s.side === 0)?.probability ?? null,
      }));
    }
    return [
      {
        key: `${market.outcomeId}:0`,
        outcomeId: market.outcomeId,
        side: 0 as OutcomeSide,
        seed: market.sides[0]?.probability ?? null,
      },
      {
        key: `${market.outcomeId}:1`,
        outcomeId: market.outcomeId,
        side: 1 as OutcomeSide,
        seed: market.sides[1]?.probability ?? null,
      },
    ];
  }, [market, multiLeg, siblings]);

  // const onTickDone = useCallback((id: string) => {
  //   setTicks((prev) => prev.filter((t) => t.id !== id));
  // }, []);

  const onLivePrints = useCallback((rows: OutcomePrint[]) => {
    const fresh: OutcomePrint[] = [];
    for (const p of rows) {
      if (seenLive.current.has(p.id)) continue;
      seenLive.current.add(p.id);
      if (ticksArmed.current) fresh.push(p);
    }
    if (!fresh.length) return;
    // Live +$ / −$ bubbles on the chart. Off — uncomment with ChartTradeTicks in ProbabilityLine.
    // setTicks((prev) =>
    //   [
    //     ...fresh.map((p) => ({
    //       id: p.id,
    //       px: p.px,
    //       signedUsd: (p.takerSide === 'buy' ? 1 : -1) * p.notional,
    //     })),
    //     ...prev,
    //   ].slice(0, 5),
    // );
  }, []);

  useEffect(() => {
    if (!market) return;
    setSelectedKey(`${market.outcomeId}:0`);
  }, [market?.outcomeId]);

  const stream = useOutcomeMarketStream(streamLegs, { onLivePrints, enabled: focused });

  const legsKey = streamLegs.map((l) => l.key).join(',');
  const range = CHART_RANGES.find((r) => r.id === rangeId) ?? CHART_RANGES[2];

  const candleQuery = useQuery({
    queryKey: ['hip4', 'candles', legsKey, range.interval],
    enabled: streamLegs.length > 0,
    queryFn: () => {
      const end = Date.now();
      const span = CANDLE_INTERVAL_MS[range.interval] * 4500;
      return fetchLegCandleSamples(streamLegs, range.interval, end - span, end);
    },
    staleTime: 15_000,
    refetchInterval: focused ? (range.interval === '1m' ? 20_000 : 45_000) : false,
  });

  useEffect(() => {
    ticksArmed.current = false;
    seenLive.current.clear();
    // setTicks([]);
    const t = setTimeout(() => {
      ticksArmed.current = true;
    }, 280);
    return () => clearTimeout(t);
  }, [market?.outcomeId, legsKey]);

  useEffect(() => {
    for (const p of stream.prints) seenLive.current.add(p.id);
    if (stream.prints.length) ticksArmed.current = true;
  }, [stream.prints]);

  const rangePending = candleQuery.isPending;

  const resolvedKey =
    selectedKey && streamLegs.some((l) => l.key === selectedKey)
      ? selectedKey
      : streamLegs[0]?.key ?? null;

  const selectedLeg = streamLegs.find((l) => l.key === resolvedKey) ?? streamLegs[0];
  const selectedMarket = multiLeg
    ? siblings.find((m) => m.outcomeId === selectedLeg?.outcomeId) ?? market
    : market;

  const liveProb = (leg: StreamLeg): number | null => {
    const live = stream.midsByKey[leg.key];
    if (live != null && isOutcomeRailPx(live) && leg.seed != null && !isOutcomeRailPx(leg.seed)) {
      return leg.seed;
    }
    return live ?? leg.seed;
  };

  const selectedProb = selectedLeg ? liveProb(selectedLeg) : null;
  const selectedName = multiLeg
    ? selectedMarket?.legLabel ?? t('hip4.yes')
    : selectedLeg?.side === 1
      ? (market?.sides[1]?.name ?? t('hip4.no'))
      : (market?.sides[0]?.name ?? t('hip4.yes'));

  const bbo = selectedLeg ? stream.bboByKey[selectedLeg.key] : undefined;
  const askPx = bbo?.ask ?? null;
  const bidPx = bbo?.bid ?? null;
  const quoteKey = selectedLeg?.key ?? '';
  const stickyQuote = useRef({ key: '', bid: null as number | null, ask: null as number | null });
  const usableBid = bidPx != null && !isOutcomeRailPx(bidPx) ? bidPx : null;
  const usableAsk = askPx != null && !isOutcomeRailPx(askPx) ? askPx : null;
  if (stickyQuote.current.key !== quoteKey) {
    stickyQuote.current = { key: quoteKey, bid: usableBid, ask: usableAsk };
  } else {
    if (usableBid != null) stickyQuote.current.bid = usableBid;
    if (usableAsk != null) stickyQuote.current.ask = usableAsk;
  }
  const displayAsk = usableAsk ?? stickyQuote.current.ask ?? selectedProb;
  const displayBid = usableBid ?? stickyQuote.current.bid ?? selectedProb;
  const quotePx = ticketAction === 'buy' ? (usableAsk ?? selectedProb) : (usableBid ?? selectedProb);
  const waitPx = Math.min(0.99, Math.max(0.01, waitCents / 100));
  const sizingPx = fillMode === 'wait' ? waitPx : quotePx;

  const bookQuery = useQuery({
    queryKey: ['hip4', 'book', selectedLeg?.outcomeId, selectedLeg?.side],
    queryFn: () => fetchOutcomeBook(selectedLeg!.outcomeId, selectedLeg!.side),
    enabled: !!selectedLeg && focused,
    staleTime: 1_500,
    refetchInterval: focused ? 8_000 : false,
  });

  const ordersQuery = useQuery({
    queryKey: ['hip4', 'open-orders', address],
    queryFn: () => fetchOutcomeOpenOrders(address as Hex),
    enabled: !!address && isAuthenticated && focused,
    staleTime: 4_000,
    refetchInterval: focused ? 8_000 : false,
  });

  useEffect(() => {
    setWaitDraft(null);
    const seed = ticketAction === 'buy' ? (usableAsk ?? selectedProb) : (usableBid ?? selectedProb);
    if (seed == null || !(seed > 0) || isOutcomeRailPx(seed)) return;
    setWaitCents(Math.min(99, Math.max(1, Math.round(seed * 100))));
  }, [ticketAction, selectedLeg?.key, fillMode]);

  const accentFor = (index: number, side: OutcomeSide): string => {
    if (multiLeg) return LEG_PALETTE[index % LEG_PALETTE.length];
    return side === 0 ? YES_COLOR : NO_COLOR;
  };

  const chartSeries = useMemo(() => {
    const now = Date.now();
    const bucket = CANDLE_INTERVAL_MS[range.interval];
    return streamLegs.map((leg, i) => {
      const hist = rangePending ? [] : (candleQuery.data?.[leg.key] ?? []);
      const live = liveProb(leg) ?? hist[hist.length - 1]?.p ?? 0.5;
      const last = hist[hist.length - 1];
      let samples = hist;
      if (rangePending) {
        samples = [];
      } else if (last && now - last.t < bucket) {
        samples = [...hist.slice(0, -1), { t: last.t, p: live }, { t: now, p: live }];
      } else if (hist.length) {
        samples = [...hist, { t: now, p: live }];
      } else {
        samples = [
          { t: now - Math.min(bucket * 8, CANDLE_INTERVAL_MS[range.interval] * 12), p: live },
          { t: now, p: live },
        ];
      }
      const label = multiLeg
        ? siblings.find((m) => m.outcomeId === leg.outcomeId)?.legLabel ?? 'Yes'
        : leg.side === 0
          ? (market?.sides[0]?.name ?? 'Yes')
          : (market?.sides[1]?.name ?? 'No');
      return {
        key: leg.key,
        label,
        color: accentFor(i, leg.side),
        samples,
        selected: false,
      };
    });
  }, [
    streamLegs,
    candleQuery.data,
    stream.midsByKey,
    multiLeg,
    siblings,
    market,
    range.interval,
    rangePending,
  ]);

  if (!rangePending && chartSeries.some((s) => s.samples.length >= 2)) {
    frozenSeries.current = chartSeries;
  }
  const displaySeries = useMemo(() => {
    const base =
      rangePending && frozenSeries.current.some((s) => s.samples.length >= 2)
        ? frozenSeries.current
        : chartSeries;
    return base.map((s) => ({ ...s, selected: s.key === resolvedKey }));
  }, [chartSeries, rangePending, resolvedKey]);

  const heading = multiLeg
    ? market?.questionName || market?.title || ''
    : market?.title ?? '';
  const subtitle =
    multiLeg || !market || looksLikePipeMeta(market.subtitle) ? '' : market.subtitle;

  const sizeUsd = Number(size);
  const spotBalances = useMemo(() => {
    const raw = spotState?.balances;
    if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
    return restBalancesQuery.data?.balances ?? [];
  }, [spotState, restBalancesQuery.data]);
  const usdcAvailable = useMemo(() => spotUsdcAvailable(spotBalances), [spotBalances]);
  const buyMaxUsd = Math.floor(Math.max(0, usdcAvailable) * 100) / 100;
  const allPositions = useMemo(
    () => positionsFromSpotBalances(spotBalances, catalog),
    [spotBalances, catalog],
  );
  const held = useMemo(() => {
    if (!selectedLeg) return null;
    return (
      allPositions.find(
        (p) => p.outcomeId === selectedLeg.outcomeId && p.side === selectedLeg.side,
      ) ?? null
    );
  }, [allPositions, selectedLeg]);
  const heldOnMarket = useMemo(() => {
    if (!market) return [];
    const ids = new Set(multiLeg ? siblings.map((s) => s.outcomeId) : [market.outcomeId]);
    return allPositions.filter((p) => ids.has(p.outcomeId) && p.shares > 0);
  }, [market, multiLeg, siblings, allPositions]);
  const heldShares = held?.shares ?? 0;
  const freeShares = held?.availableShares ?? heldShares;
  const heldOnOrder = Math.max(0, heldShares - freeShares);
  const heldValue = held?.valueUsd ?? 0;
  const canSell = heldShares >= 1;

  const buyShares =
    Number.isFinite(sizeUsd) && sizeUsd > 0 && sizingPx
      ? outcomeSharesForUsd(sizeUsd, sizingPx)
      : 0;
  const sellShares =
    ticketAction === 'sell' && sellAll && heldShares >= 1
      ? heldShares
      : Number.isFinite(sizeUsd) && sizeUsd > 0 && sizingPx
        ? outcomeSellSharesForUsd(sizeUsd, sizingPx, freeShares)
        : 0;
  const shares = ticketAction === 'sell' ? sellShares : buyShares;
  const closingAll =
    ticketAction === 'sell' && heldShares > 0 && (sellAll || sellShares + 1e-9 >= heldShares);
  const residualClose = ticketAction === 'sell' && canSell && closingAll;
  const belowMin =
    Number.isFinite(sizeUsd) &&
    sizeUsd > 0 &&
    sizeUsd + 1e-9 < MIN_OUTCOME_NOTIONAL_USD &&
    !residualClose &&
    (ticketAction === 'buy' || canSell);
  const overBalance =
    isAuthenticated &&
    ticketAction === 'buy' &&
    Number.isFinite(sizeUsd) &&
    sizeUsd > 0 &&
    sizeUsd > usdcAvailable + 0.01;
  const sizeBlocked = belowMin || overBalance;

  const fillHint = useMemo(() => {
    if (fillMode !== 'now' || !sizingPx || !(shares > 0)) return null;
    const fill = estimateBookFill(bookQuery.data, ticketAction, shares);
    if (!fill) return null;
    if (fill.short) return t('hip4.ticket.fillShort');
    if (ticketAction === 'buy') return null;
    const best = bookQuery.data?.bids[0]?.px;
    if (best != null && Math.abs(fill.avgPx - best) >= 0.015) {
      return t('hip4.ticket.fillAround', { cents: Math.round(fill.avgPx * 100) });
    }
    return null;
  }, [fillMode, sizingPx, shares, bookQuery.data, ticketAction, t]);

  const buyPayout = useMemo(() => {
    if (ticketAction !== 'buy' || !Number.isFinite(sizeUsd) || !(sizeUsd > 0)) return null;
    return estimateBuyPayout({
      usd: sizeUsd,
      book: fillMode === 'wait' ? null : bookQuery.data,
      limitPx: fillMode === 'wait' ? waitPx : null,
      fallbackPx: sizingPx,
    });
  }, [ticketAction, sizeUsd, fillMode, bookQuery.data, waitPx, sizingPx]);

  const sellPayout = useMemo(() => {
    if (ticketAction !== 'sell' || !(shares > 0)) return null;
    return estimateSellPayout({
      shares,
      book: fillMode === 'wait' ? null : bookQuery.data,
      limitPx: fillMode === 'wait' ? waitPx : null,
      fallbackPx: sizingPx,
    });
  }, [ticketAction, shares, fillMode, bookQuery.data, waitPx, sizingPx]);
  const payout = ticketAction === 'buy' ? buyPayout : sellPayout;

  const waitCrosses =
    fillMode === 'wait' &&
    ((ticketAction === 'buy' && askPx != null && waitPx + 1e-9 >= askPx) ||
      (ticketAction === 'sell' && bidPx != null && waitPx - 1e-9 <= bidPx));

  const questionIds = useMemo(
    () => (market ? questionOutcomeIds(catalog, market) : []),
    [catalog, market],
  );
  const pairId = selectedLeg?.outcomeId ?? market?.outcomeId ?? null;
  const pairShares = pairId != null ? pairedRedeemShares(spotBalances, pairId) : 0;
  const setShares = market?.questionId != null ? questionRedeemShares(spotBalances, questionIds) : 0;
  const redeemKind: 'question' | 'pair' | null =
    setShares >= 1 ? 'question' : pairShares >= 1 ? 'pair' : null;
  const redeemShares = redeemKind === 'question' ? setShares : pairShares;

  const waitingOrders = useMemo(() => {
    const rows = ordersQuery.data ?? [];
    if (!market) return [];
    const ids = new Set(multiLeg ? questionIds : [market.outcomeId]);
    return rows.filter((o) => ids.has(o.outcomeId));
  }, [ordersQuery.data, market, multiLeg, questionIds]);

  useEffect(() => {
    if (ticketAction === 'sell' && !canSell) setTicketAction('buy');
  }, [canSell, ticketAction]);

  const ctaColor = selectedLeg
    ? accentFor(
        Math.max(
          0,
          streamLegs.findIndex((l) => l.key === selectedLeg.key),
        ),
        selectedLeg.side,
      )
    : YES_COLOR;

  const legNames = useMemo(() => {
    const map: Record<number, string> = {};
    if (multiLeg) {
      for (const m of siblings) map[m.outcomeId] = m.legLabel;
    }
    return map;
  }, [multiLeg, siblings]);

  const openReview = (tradeSide: 'buy' | 'sell') => {
    if (!market || !selectedLeg) return;
    if (!isAuthenticated) {
      pushRouteOnce(router, '/login');
      return;
    }
    if (!setupComplete && isExternalWalletUser) {
      requestExternalSetup();
      return;
    }
    if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) {
      showErrorToast(t('hip4.ticket.enterSizeToast'), t('hip4.ticket.errSize'));
      return;
    }
    if (!sizingPx) {
      showErrorToast(t('hip4.ticket.noLivePrice'), t('hip4.ticket.errPrice'));
      return;
    }
    if (tradeSide === 'buy' && sizeUsd + 1e-9 < MIN_OUTCOME_NOTIONAL_USD) {
      showErrorToast(t('hip4.ticket.minSize', { min: MIN_OUTCOME_NOTIONAL_USD }), t('hip4.ticket.errSize'));
      return;
    }
    if (tradeSide === 'buy' && sizeUsd > usdcAvailable + 0.01) {
      showErrorToast(
        usdcAvailable > 0.005
          ? t('hip4.ticket.youHaveUsdc', { amount: usdcAvailable.toFixed(2) })
          : t('hip4.ticket.notEnoughUsdc'),
        t('hip4.ticket.errSize'),
      );
      return;
    }
    if (tradeSide === 'sell' && heldShares < 1) {
      showErrorToast(t('hip4.ticket.dontHold', { name: selectedName }), t('hip4.ticket.errSell'));
      return;
    }
    const nextSellShares =
      tradeSide === 'sell'
        ? sellAll && heldShares >= 1
          ? heldShares
          : outcomeSellSharesForUsd(sizeUsd, sizingPx, freeShares)
        : 0;
    if (tradeSide === 'sell' && nextSellShares < 1) {
      showErrorToast(
        heldOnOrder >= 1 && !sellAll ? t('hip4.ticket.noFreeShares') : t('hip4.ticket.sizeTooSmallSell'),
        t('hip4.ticket.errSell'),
      );
      return;
    }
    const nextBuyShares = tradeSide === 'buy' ? outcomeSharesForUsd(sizeUsd, sizingPx) : 0;
    const nextShares = tradeSide === 'sell' ? nextSellShares : nextBuyShares;
    if (nextShares < 1) {
      showErrorToast(t('hip4.ticket.sizeTooSmall'), t('hip4.ticket.errSize'));
      return;
    }
    const nextClosingAll =
      tradeSide === 'sell' && heldShares > 0 && (sellAll || nextSellShares >= heldShares - 1e-9);
    const sellNtl = nextSellShares * sizingPx;
    if (
      tradeSide === 'sell' &&
      !nextClosingAll &&
      sellNtl + 1e-9 < MIN_OUTCOME_NOTIONAL_USD
    ) {
      showErrorToast(t('hip4.ticket.minSize', { min: MIN_OUTCOME_NOTIONAL_USD }), t('hip4.ticket.errSize'));
      return;
    }
    Keyboard.dismiss();
    setSizeEditing(false);
    const waiting = fillMode === 'wait';
    setTicket({
      phase: 'confirm',
      outcomeId: selectedLeg.outcomeId,
      side: selectedLeg.side,
      sizeUsd,
      orderType: waiting ? 'limit' : 'market',
      limitPx: waiting ? waitPx : undefined,
      payload: {
        tradeSide,
        sideName: selectedName,
        heading,
        shares: nextShares,
        usd: tradeSide === 'sell' ? sellNtl : sizeUsd,
        px: sizingPx,
        accent: ctaColor,
        closingAll: nextClosingAll,
        wait: waiting,
        fillHint: waiting ? (waitCrosses ? t('hip4.ticket.fillSoon') : undefined) : (fillHint ?? undefined),
      },
    });
    void Haptics.selectionAsync();
  };

  const liveTicketPayload = useMemo((): OrderTicketPayload | null => {
    if (!ticket || ticket.phase !== 'confirm' || busy) return ticket?.payload ?? null;
    if (ticket.orderType === 'limit') return ticket.payload;
    const sameLeg =
      selectedLeg?.outcomeId === ticket.outcomeId && selectedLeg?.side === ticket.side;
    const livePx = ticket.payload.tradeSide === 'buy' ? (askPx ?? selectedProb) : (bidPx ?? selectedProb);
    const px = (sameLeg ? livePx : null) ?? ticket.payload.px;
    if (px == null || !(px > 0)) return ticket.payload;
    if (ticket.payload.tradeSide === 'buy') {
      return {
        ...ticket.payload,
        px,
        shares: outcomeSharesForUsd(ticket.sizeUsd, px),
        usd: ticket.sizeUsd,
        closingAll: false,
      };
    }
    if (ticket.payload.closingAll && heldShares >= 1) {
      return {
        ...ticket.payload,
        px,
        shares: heldShares,
        usd: heldShares * px,
        closingAll: true,
      };
    }
    const shares = outcomeSellSharesForUsd(ticket.sizeUsd, px, freeShares);
    return {
      ...ticket.payload,
      px,
      shares,
      usd: shares * px,
      closingAll: heldShares > 0 && shares >= heldShares - 1e-9,
    };
  }, [ticket, busy, selectedLeg, selectedProb, heldShares, freeShares, askPx, bidPx]);

  const placeReviewed = async () => {
    if (!ticket || ticket.phase !== 'confirm') return;
    const quote = liveTicketPayload;
    const px = quote?.px ?? ticket.payload.px;
    const shares = quote?.shares ?? ticket.payload.shares;
    if (px == null || !(px > 0) || shares < 1) {
      showErrorToast(t('hip4.ticket.priceMoved'), t('hip4.ticket.errPrice'));
      return;
    }
    const tradeSide = ticket.payload.tradeSide;
    const closingAll = quote?.closingAll ?? ticket.payload.closingAll;
    const sellSharesOut = tradeSide === 'sell' && closingAll && heldShares >= 1 ? heldShares : shares;
    const ntl = sellSharesOut * px;
    const skipMinNotional = tradeSide === 'sell' && closingAll;
    const frozen: OrderTicketPayload = {
      ...ticket.payload,
      px,
      shares: sellSharesOut,
      usd: tradeSide === 'sell' ? ntl : ticket.sizeUsd,
      closingAll,
    };
    setTicket({ ...ticket, payload: frozen });
    setBusy(tradeSide);
    try {
      let sizeShares = tradeSide === 'sell' ? sellSharesOut : undefined;
      let skipMin = skipMinNotional;
      if (tradeSide === 'sell' && address) {
        if (skipMinNotional) {
          sizeShares = await releaseOutcomeSellHolds({
            user: address as Hex,
            outcomeId: ticket.outcomeId,
            side: ticket.side,
          });
          skipMin = true;
          void queryClient.invalidateQueries({ queryKey: ['hip4', 'open-orders'] });
        } else {
          const spotNow = await fetchSpotClearinghouse(address as Hex);
          const free = outcomeFreeShares(spotNow.balances, ticket.outcomeId, ticket.side);
          if (sizeShares != null && sizeShares > free + 1e-9) {
            sizeShares = Math.floor(free + 1e-12);
          }
        }
        if (!(sizeShares != null && sizeShares >= 1)) {
          throw new Hip4Error(t('hip4.ticket.noFreeShares'));
        }
      }
      const result = await placeOutcomeOrder({
        outcomeId: ticket.outcomeId,
        side: ticket.side,
        tradeSide,
        sizeUsd: ticket.sizeUsd,
        sizeShares,
        skipMinNotional: skipMin,
        orderType: ticket.orderType,
        limitPx: ticket.orderType === 'limit' ? ticket.limitPx : undefined,
        referencePx: px,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const filled =
        result.filledShares != null && result.filledShares > 0
          ? result.filledShares
          : sellSharesOut;
      const avg =
        result.avgPx != null && result.avgPx > 0 ? result.avgPx : px;
      const usd =
        result.status === 'filled' && avg != null ? filled * avg : frozen.usd;
      setTicket({
        phase: 'receipt',
        outcomeId: ticket.outcomeId,
        side: ticket.side,
        sizeUsd: ticket.sizeUsd,
        orderType: ticket.orderType,
        limitPx: ticket.limitPx,
        status: result.status,
        payload: {
          ...frozen,
          shares: filled,
          usd,
          px: avg,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['hip4', 'spot'] });
      queryClient.invalidateQueries({ queryKey: ['hip4', 'open-orders'] });
      queryClient.invalidateQueries({ queryKey: ['hip4', 'book'] });
      queryClient.invalidateQueries({ queryKey: ['hip4', 'fills'] });
      queryClient.invalidateQueries({ queryKey: ['hip4', 'historical-cancels'], refetchType: 'none' });
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const raw = err instanceof Hip4Error ? err.raw : err instanceof Error ? err.message : String(err);
      const nice = humanizeHyperliquidError(raw);
      setTicket((t) =>
        t ? { ...t, phase: 'error', error: { title: nice.title, message: nice.message } } : t,
      );
    } finally {
      setBusy(null);
    }
  };

  const cancelWaiting = async (order: {
    oid: number;
    outcomeId: number;
    side: OutcomeSide;
  }) => {
    if (busy) return;
    setBusy('cancel');
    try {
      await cancelOutcomeOrder(order);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (address) {
        queryClient.setQueryData(
          ['hip4', 'open-orders', address],
          (prev: { oid: number }[] | undefined) => (prev ?? []).filter((o) => o.oid !== order.oid),
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['hip4', 'open-orders'] });
      queryClient.invalidateQueries({ queryKey: ['hip4', 'historical-cancels'], refetchType: 'none' });
    } catch (err) {
      const raw = err instanceof Hip4Error ? err.raw : err instanceof Error ? err.message : String(err);
      const nice = humanizeHyperliquidError(raw);
      showErrorToast(nice.message, nice.title);
    } finally {
      setBusy(null);
    }
  };

  const runRedeem = async () => {
    const kind = redeemAsk;
    setRedeemAsk(null);
    if (!market || !kind) return;
    setBusy('redeem');
    try {
      if (kind === 'question' && market.questionId != null) {
        await redeemQuestionBundle(market.questionId);
      } else if (selectedLeg) {
        await redeemOutcomePair(selectedLeg.outcomeId);
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['hip4', 'spot'] });
      queryClient.invalidateQueries({ queryKey: ['hip4', 'fills'] });
    } catch (err) {
      const raw = err instanceof Hip4Error ? err.raw : err instanceof Error ? err.message : String(err);
      const nice = humanizeHyperliquidError(raw);
      showErrorToast(nice.message, nice.title);
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.flex}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.back} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.text.primary} />
            <Text style={styles.backLabel}>{t('hip4.ticket.back')}</Text>
          </TouchableOpacity>

          {catalogQuery.isLoading && !market ? (
            <ActivityIndicator color={colors.accent.gold} style={{ marginTop: 40 }} />
          ) : !market ? (
            <View style={styles.missingCard}>
              <View style={styles.missingIcon}>
                <Ionicons name="flag-outline" size={22} color={colors.accent.goldDark} />
              </View>
              <Text style={styles.missingTitle}>{t('hip4.ticket.missing')}</Text>
              <Text style={styles.missingHint}>{t('hip4.ticket.missingHint')}</Text>
              <TouchableOpacity
                style={styles.missingCta}
                onPress={() => navigateRouteOnce(router, '/markets')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('hip4.ticket.missingCta')}
              >
                <Text style={styles.missingCtaLabel}>{t('hip4.ticket.missingCta')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <MarketCountdown
                statusLabel={
                  market.status === 'live'
                    ? t('hip4.status.live')
                    : market.status === 'upcoming'
                      ? t('hip4.status.upcoming')
                      : t('hip4.status.settled')
                }
                startsAt={market.startsAt}
                expiresAt={market.expiresAt}
              />
              <View style={styles.titleRow}>
                <MarketSymbol market={market} size={44} radius={14} questionLevel={multiLeg} />
                <Text style={styles.title}>{heading}</Text>
              </View>
              {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}

              <View style={styles.hero}>
                <View style={styles.heroTop}>
                  <Text style={styles.heroLabel}>
                    {multiLeg ? t('hip4.ticket.outcomeChances') : t('hip4.ticket.yesNoChances')}
                  </Text>
                  <View style={[styles.liveChip, stream.connected && styles.liveChipOn]}>
                    <View style={[styles.liveDot, stream.connected && styles.liveDotOn]} />
                    <Text style={[styles.liveChipText, stream.connected && styles.liveChipTextOn]}>
                      {stream.connected ? t('hip4.status.live') : t('hip4.status.connecting')}
                    </Text>
                  </View>
                </View>
                <ProbabilityChart
                  series={displaySeries}
                  height={148}
                  // ticks={ticks}
                  // onTickDone={onTickDone}
                  loading={rangePending}
                />
                <View style={styles.ranges}>
                  {CHART_RANGES.map((r) => {
                    const on = r.id === rangeId;
                    return (
                      <TouchableOpacity
                        key={r.id}
                        style={[styles.rangeChip, on && styles.rangeChipOn]}
                        onPress={() => {
                          setRangeId(r.id);
                          void Haptics.selectionAsync();
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.rangeLabel, on && styles.rangeLabelOn]}>{r.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {multiLeg ? (
                <View style={styles.legList}>
                  {streamLegs.map((leg, i) => {
                    const label =
                      siblings.find((m) => m.outcomeId === leg.outcomeId)?.legLabel ?? t('hip4.yes');
                    const on = leg.key === resolvedKey;
                    const accent = accentFor(i, leg.side);
                    const px = liveProb(leg);
                    return (
                      <TouchableOpacity
                        key={leg.key}
                        style={[styles.legRow, on && styles.legRowOn]}
                        onPress={() => {
                          setSelectedKey(leg.key);
                          void Haptics.selectionAsync();
                        }}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.legDot, { backgroundColor: accent }]} />
                        <Text style={styles.legName} numberOfLines={1}>
                          {label}
                        </Text>
                        <Text style={[styles.legPct, { color: accent }]}>{impliedPercent(px)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.pills}>
                  {streamLegs.map((leg, i) => {
                    const label =
                      leg.side === 0
                        ? (market.sides[0]?.name ?? t('hip4.yes'))
                        : (market.sides[1]?.name ?? t('hip4.no'));
                    return (
                      <OddsPill
                        key={leg.key}
                        label={label}
                        probability={liveProb(leg)}
                        variant={leg.side === 0 ? 'yes' : 'no'}
                        accent={accentFor(i, leg.side)}
                        selected={leg.key === resolvedKey}
                        onPress={() => {
                          setSelectedKey(leg.key);
                          void Haptics.selectionAsync();
                        }}
                      />
                    );
                  })}
                </View>
              )}

              <Text style={styles.quoteLine} numberOfLines={1}>
                {t('hip4.ticket.buyAt', {
                  cents: displayAsk != null ? Math.round(displayAsk * 100) : '—',
                })}
                {' · '}
                {t('hip4.ticket.sellAt', {
                  cents: displayBid != null ? Math.round(displayBid * 100) : '—',
                })}
              </Text>

              <View style={styles.actionSwitch}>
                {(['buy', 'sell'] as const).map((action) => {
                  const on = ticketAction === action;
                  const sellLocked = action === 'sell' && !canSell;
                  return (
                    <TouchableOpacity
                      key={action}
                      style={[
                        styles.actionChip,
                        on && (action === 'sell' ? styles.actionChipSellOn : { backgroundColor: ctaColor }),
                        sellLocked && styles.actionChipMuted,
                      ]}
                      onPress={() => {
                        if (sellLocked) {
                          showErrorToast(t('hip4.ticket.dontHold', { name: selectedName }), t('hip4.ticket.errSell'));
                          return;
                        }
                        setTicketAction(action);
                        if (
                          action === 'sell' &&
                          heldValue > 0 &&
                          heldValue + 1e-9 < MIN_OUTCOME_NOTIONAL_USD &&
                          (usableBid ?? selectedProb)
                        ) {
                          setSellAll(true);
                          setSize((heldShares * (usableBid ?? selectedProb)!).toFixed(2));
                        } else if (action === 'buy') {
                          setSellAll(false);
                        }
                        void Haptics.selectionAsync();
                      }}
                      activeOpacity={sellLocked ? 1 : 0.85}
                    >
                      <Text
                        style={[
                          styles.actionChipLabel,
                          on && styles.actionChipLabelOn,
                          sellLocked && styles.actionChipLabelMuted,
                        ]}
                      >
                        {action === 'buy' ? t('hip4.ticket.buy') : t('hip4.ticket.sell')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.modeMenu} collapsable={false}>
                <View style={styles.modeRow}>
                  <TouchableOpacity
                    style={styles.modeToggle}
                    onPress={() => {
                      setModeOpen((o) => !o);
                      void Haptics.selectionAsync();
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={
                      fillMode === 'now' ? t('hip4.ticket.fillNow') : t('hip4.ticket.wait')
                    }
                  >
                    <Text style={styles.modeToggleLabelOn}>
                      {fillMode === 'now' ? t('hip4.ticket.fillNow') : t('hip4.ticket.wait')}
                    </Text>
                    <Ionicons
                      name={modeOpen ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.accent.goldDark}
                    />
                  </TouchableOpacity>
                  <View
                    style={styles.waitStepper}
                    pointerEvents={fillMode === 'wait' ? 'auto' : 'none'}
                  >
                    {fillMode === 'wait' ? (
                      <>
                        <TouchableOpacity
                          style={[styles.waitBtn, waitCents <= 1 && styles.waitBtnMuted]}
                          disabled={waitCents <= 1}
                          onPress={() => {
                            setWaitDraft(null);
                            setWaitCents((n) => Math.max(1, n - 1));
                            void Haptics.selectionAsync();
                          }}
                          hitSlop={8}
                        >
                          <Ionicons name="remove" size={18} color={colors.text.primary} />
                        </TouchableOpacity>
                        <Pressable
                          style={styles.waitCentsHit}
                          onPress={() => {
                            if (waitDraft == null) setWaitDraft(String(waitCents));
                          }}
                        >
                          {waitDraft != null ? (
                            <TextInput
                              value={waitDraft}
                              onChangeText={(v) => setWaitDraft(v.replace(/[^\d]/g, '').slice(0, 2))}
                              keyboardType="number-pad"
                              autoFocus
                              selectTextOnFocus
                              maxLength={2}
                              onBlur={() => {
                                const n = parseInt(waitDraft, 10);
                                if (Number.isFinite(n) && n >= 1 && n <= 99) setWaitCents(n);
                                setWaitDraft(null);
                              }}
                              style={styles.waitCents}
                            />
                          ) : (
                            <Text style={styles.waitCents}>{waitCents}</Text>
                          )}
                          <Text style={styles.waitCentsSuffix}>¢</Text>
                        </Pressable>
                        <TouchableOpacity
                          style={[styles.waitBtn, waitCents >= 99 && styles.waitBtnMuted]}
                          disabled={waitCents >= 99}
                          onPress={() => {
                            setWaitDraft(null);
                            setWaitCents((n) => Math.min(99, n + 1));
                            void Haptics.selectionAsync();
                          }}
                          hitSlop={8}
                        >
                          <Ionicons name="add" size={18} color={colors.text.primary} />
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                </View>
                {modeOpen ? (
                  <TouchableOpacity
                    style={styles.modeOption}
                    onPress={() => {
                      setFillMode(fillMode === 'now' ? 'wait' : 'now');
                      setModeOpen(false);
                      void Haptics.selectionAsync();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.modeToggleLabel}>
                      {fillMode === 'now' ? t('hip4.ticket.wait') : t('hip4.ticket.fillNow')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {heldOnMarket.length > 0 ? (
                <View style={styles.heldStack}>
                  {heldOnMarket.map((p) => {
                    const name = multiLeg
                      ? siblings.find((s) => s.outcomeId === p.outcomeId)?.legLabel || p.sideName
                      : p.sideName;
                    const onOrder = Math.max(0, p.shares - (p.availableShares ?? p.shares));
                    return (
                      <TouchableOpacity
                        key={`${p.outcomeId}:${p.side}`}
                        style={styles.heldCard}
                        onPress={() => {
                          const key = `${p.outcomeId}:${p.side}`;
                          setSelectedKey(key);
                          const bbo = stream.bboByKey[key];
                          const bid =
                            bbo?.bid != null && !isOutcomeRailPx(bbo.bid)
                              ? bbo.bid
                              : p.probability;
                          if (!bid) return;
                          Keyboard.dismiss();
                          setSizeEditing(false);
                          setTicketAction('sell');
                          setSellAll(true);
                          setSize((p.shares * bid).toFixed(2));
                          void Haptics.selectionAsync();
                        }}
                        activeOpacity={0.85}
                      >
                        <View>
                          <Text style={styles.heldKicker}>
                            {t('hip4.ticket.yourPosition', { name })}
                          </Text>
                          <Text style={styles.heldMain}>
                            {t('hip4.ticket.sharesLine', {
                              shares: Number.isInteger(p.shares)
                                ? String(p.shares)
                                : p.shares.toFixed(1),
                            })}
                            {p.valueUsd > 0 ? ` · $${p.valueUsd.toFixed(2)}` : ''}
                          </Text>
                          {p.avgCost != null && p.avgCost > 0 ? (
                            <Text style={styles.heldAvg}>
                              {t('hip4.ticket.avgEntry', {
                                cents: formatOutcomeCents(p.avgCost),
                              })}
                            </Text>
                          ) : null}
                          {onOrder >= 1 ? (
                            <Text style={styles.heldWorking}>
                              {t('hip4.ticket.workingSellHint', {
                                shares: Number.isInteger(onOrder)
                                  ? String(onOrder)
                                  : onOrder.toFixed(1),
                              })}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.heldMax}>{t('hip4.ticket.max')}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              {redeemKind && redeemShares >= 1 && isAuthenticated ? (
                <TouchableOpacity
                  style={styles.redeemBtn}
                  onPress={() => setRedeemAsk(redeemKind)}
                  disabled={!!busy}
                  activeOpacity={0.85}
                >
                  <Text style={styles.redeemLabel}>
                    {redeemKind === 'question'
                      ? t('hip4.ticket.cashOutSet', { amount: redeemShares.toFixed(0) })
                      : t('hip4.ticket.cashOutPair', { amount: redeemShares.toFixed(0) })}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.fieldHead}>
                <Text style={styles.fieldLabel}>
                  {ticketAction === 'sell' && sellAll && !sizeEditing
                    ? t('hip4.ticket.sellSizeSharesLabel')
                    : ticketAction === 'sell'
                      ? t('hip4.ticket.sellSizeLabel')
                      : t('hip4.ticket.sizeLabel')}
                </Text>
                <Text style={styles.availHint} numberOfLines={1}>
                  {t('hip4.ticket.available')}{' '}
                  <Text style={styles.availAmt}>
                    {isAuthenticated
                      ? ticketAction === 'sell'
                        ? t('hip4.ticket.availableShares', {
                            shares: Number.isInteger(freeShares)
                              ? String(freeShares)
                              : freeShares.toFixed(1),
                            name: selectedName,
                          })
                        : `$${usdcAvailable.toFixed(2)}`
                      : '—'}
                  </Text>
                  {isAuthenticated && ticketAction === 'buy' ? (
                    <CurrencyHint usd={usdcAvailable} placement="inline" textStyle={{ marginLeft: 6 }} />
                  ) : null}
                </Text>
              </View>
              <Pressable
                style={[styles.input, sizeBlocked && styles.inputError]}
                onPress={() => {
                  if (sellAll) setSellAll(false);
                  setSizeEditing(true);
                }}
              >
                {ticketAction === 'sell' && sellAll && !sizeEditing ? (
                  <>
                    <RollingNumber
                      value={heldShares}
                      format={(n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))}
                      emptyText="0"
                      align="left"
                      durationMs={480}
                      style={styles.inputNum}
                    />
                    {sizingPx ? (
                      <Text style={styles.inputUsdHint}>
                        {t('hip4.ticket.approxUsd', { amount: (heldShares * sizingPx).toFixed(2) })}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Text style={styles.inputDollar}>$</Text>
                    {sizeEditing ? (
                      <TextInput
                        value={size}
                        onChangeText={(next) => {
                          setSellAll(false);
                          setSize(next);
                        }}
                        keyboardType="decimal-pad"
                        placeholder="10"
                        placeholderTextColor={colors.text.muted}
                        style={styles.inputField}
                        autoFocus
                        selectTextOnFocus
                        onBlur={() => setSizeEditing(false)}
                      />
                    ) : (
                      <RollingNumber
                        value={Number.isFinite(sizeUsd) ? sizeUsd : null}
                        format={(n) => (Math.abs(n - Math.round(n)) < 0.001 ? String(Math.round(n)) : n.toFixed(2))}
                        emptyText="0"
                        align="left"
                        durationMs={480}
                        style={styles.inputNum}
                      />
                    )}
                  </>
                )}
              </Pressable>
              <CurrencyHint
                usd={
                  ticketAction === 'sell' && sellAll && sizingPx
                    ? heldShares * sizingPx
                    : Number.isFinite(sizeUsd)
                      ? sizeUsd
                      : null
                }
              />
              <View style={styles.quick}>
                {QUICK.map((n) => {
                  const chipOver =
                    isAuthenticated && ticketAction === 'buy' && n > usdcAvailable + 0.01;
                  return (
                    <TouchableOpacity
                      key={n}
                      style={[
                        styles.quickBtn,
                        size === String(n) && styles.quickOn,
                        chipOver && styles.quickMuted,
                      ]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setSizeEditing(false);
                        setSellAll(false);
                        setSize(String(n));
                        void Haptics.selectionAsync();
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.quickLabel, chipOver && styles.quickLabelMuted]}>${n}</Text>
                    </TouchableOpacity>
                  );
                })}
                {ticketAction === 'buy' && isAuthenticated && buyMaxUsd > 0.005 ? (
                  <TouchableOpacity
                    style={[
                      styles.quickBtn,
                      Math.abs(sizeUsd - buyMaxUsd) < 0.005 && styles.quickOn,
                    ]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setSizeEditing(false);
                      setSellAll(false);
                      setSize(buyMaxUsd.toFixed(2));
                      void Haptics.selectionAsync();
                    }}
                  >
                    <Text style={styles.quickLabel}>{t('hip4.ticket.max')}</Text>
                  </TouchableOpacity>
                ) : heldShares > 0 ? (
                  <TouchableOpacity
                    style={[styles.quickBtn, closingAll && styles.quickOn]}
                    onPress={() => {
                      const px = usableBid ?? selectedProb;
                      if (!px) return;
                      Keyboard.dismiss();
                      setSizeEditing(false);
                      setTicketAction('sell');
                      setSellAll(true);
                      setSize((heldShares * px).toFixed(2));
                      void Haptics.selectionAsync();
                    }}
                  >
                    <Text style={styles.quickLabel}>{t('hip4.ticket.max')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {overBalance ? (
                <Text style={styles.sizeError}>
                  {usdcAvailable > 0.005
                    ? t('hip4.ticket.notEnoughUsdcAvail', { amount: usdcAvailable.toFixed(2) })
                    : t('hip4.ticket.notEnoughUsdc')}
                </Text>
              ) : belowMin ? (
                <Text style={styles.sizeError}>
                  {t('hip4.ticket.minSize', { min: MIN_OUTCOME_NOTIONAL_USD })}
                </Text>
              ) : shares > 0 ? (
                <View style={styles.estRow}>
                  <Text style={styles.est}>
                    {ticketAction === 'sell' ? t('hip4.ticket.sells') : t('hip4.ticket.approx')}
                  </Text>
                  <RollingNumber
                    value={shares}
                    format={(n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))}
                    align="left"
                    durationMs={420}
                    style={styles.estNum}
                  />
                  <Text style={styles.est}>
                    {ticketAction === 'sell' && heldShares > 0
                      ? t('hip4.ticket.ofShares', {
                          held: Number.isInteger(heldShares) ? String(heldShares) : heldShares.toFixed(1),
                          name: selectedName,
                        })
                      : t('hip4.ticket.sharesAt', { name: selectedName })}
                  </Text>
                  {ticketAction === 'buy' ? (
                    <RollingNumber
                      value={selectedProb != null ? selectedProb * 100 : null}
                      format={(n) => `${Math.round(n)}%`}
                      align="left"
                      durationMs={420}
                      style={styles.estNum}
                    />
                  ) : null}
                </View>
              ) : (
                <Text style={[styles.est, { marginTop: 10 }]}>
                  {ticketAction === 'sell' && canSell && heldValue + 1e-9 < MIN_OUTCOME_NOTIONAL_USD
                    ? t('hip4.ticket.leftoverUnderMin', { min: MIN_OUTCOME_NOTIONAL_USD })
                    : t('hip4.ticket.minSize', { min: MIN_OUTCOME_NOTIONAL_USD })}
                </Text>
              )}
              {waitCrosses || fillHint ? (
                <Text style={styles.hintSlot} numberOfLines={1}>
                  {waitCrosses ? t('hip4.ticket.fillSoon') : fillHint}
                </Text>
              ) : null}

              {payout && market.status !== 'settled' ? (
                <View style={styles.toWin}>
                  <View style={styles.toWinCopy}>
                    <View style={styles.toWinLabelRow}>
                      <Text style={styles.toWinLabel}>
                        {ticketAction === 'buy' ? t('hip4.ticket.toWin') : t('hip4.ticket.youGet')}
                      </Text>
                      <Ionicons name="cash-outline" size={16} color={colors.status.success} />
                    </View>
                    <Text style={styles.toWinAvg}>
                      {t('hip4.ticket.avgPrice', { cents: formatOutcomeCents(payout.avgPx) })}
                    </Text>
                  </View>
                  <View style={styles.toWinAmtCol}>
                    <View style={styles.toWinAmtRow}>
                    <Text style={styles.toWinAmt}>$</Text>
                    <RollingNumber
                      value={payout.toWinUsd}
                      format={(n) =>
                        n.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      }
                      align="right"
                      durationMs={480}
                      style={styles.toWinAmt}
                    />
                    </View>
                    <CurrencyHint usd={payout.toWinUsd} />
                  </View>
                </View>
              ) : null}

              {market.status === 'settled' ? (
                <View style={[styles.cta, styles.ctaBusy, { marginTop: payout ? 16 : 22 }]}>
                  <Text style={styles.ctaLabel}>{t('hip4.ticket.settled')}</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.cta,
                    { marginTop: payout ? 16 : 22, backgroundColor: ticketAction === 'sell' ? colors.status.error : ctaColor },
                    (busy && !ticket) || sizeBlocked || (ticketAction === 'sell' && !canSell)
                      ? styles.ctaBusy
                      : null,
                  ]}
                  onPress={() => openReview(ticketAction)}
                  disabled={!!busy || !!ticket || sizeBlocked || (ticketAction === 'sell' && !canSell)}
                  activeOpacity={0.85}
                >
                  {busy && !ticket ? (
                    <ActivityIndicator color={ticketAction === 'sell' ? '#FFFFFF' : '#04110c'} />
                  ) : (
                    <Text style={styles.ctaLabel}>
                      {fillMode === 'wait'
                        ? t('hip4.ticket.waitCta', { cents: waitCents })
                        : ticketAction === 'sell'
                          ? closingAll
                            ? t('hip4.ticket.closeAll', { name: selectedName })
                            : t('hip4.ticket.sellName', { name: selectedName })
                          : t('hip4.ticket.buyName', { name: selectedName })}
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {market.status !== 'settled' ? (
                <Text style={styles.feeHint}>{t('hip4.ticket.feeHint', { rate: sellFeeLabel })}</Text>
              ) : null}

              {waitingOrders.length > 0 ? (
                <View style={styles.waitingList}>
                  {waitingOrders.map((o) => {
                    const name = multiLeg
                      ? siblings.find((m) => m.outcomeId === o.outcomeId)?.legLabel ?? t('hip4.yes')
                      : o.side === 0
                        ? (market.sides[0]?.name ?? t('hip4.yes'))
                        : (market.sides[1]?.name ?? t('hip4.no'));
                    return (
                      <View key={`${o.oid}:${o.outcomeId}:${o.side}`} style={styles.waitingRow}>
                        <Text style={styles.waitingText} numberOfLines={1}>
                          {t('hip4.ticket.waiting')} · {name} · {Math.round(o.limitPx * 100)}¢
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            void cancelWaiting({
                              oid: o.oid,
                              outcomeId: o.outcomeId,
                              side: o.side,
                            });
                          }}
                          disabled={!!busy}
                          hitSlop={8}
                          style={styles.waitingCancelChip}
                        >
                          <Text style={styles.waitingCancel}>{t('hip4.ticket.cancelWait')}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <MarketActivityTabs
                market={market}
                prints={stream.prints}
                tapeReady={stream.tapeReady}
                multiLeg={multiLeg}
                legNames={legNames}
                book={bookQuery.data}
                bookLoading={bookQuery.isPending}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <OrderTicketModal
        visible={!!ticket}
        phase={ticket?.phase ?? 'confirm'}
        payload={liveTicketPayload}
        status={ticket?.status}
        error={ticket?.error}
        busy={!!busy}
        livePrice={ticket?.phase === 'confirm' && !busy && ticket?.orderType !== 'limit'}
        onConfirm={() => {
          void placeReviewed();
        }}
        onClose={() => {
          if (busy) return;
          setTicket(null);
        }}
      />
      <ConfirmModal
        visible={!!redeemAsk}
        title={t('hip4.ticket.cashOutTitle')}
        message={
          redeemAsk === 'question' ? t('hip4.ticket.cashOutSetMsg') : t('hip4.ticket.cashOutPairMsg')
        }
        confirmLabel={t('hip4.ticket.cashOutTitle')}
        onConfirm={() => {
          void runRedeem();
        }}
        onCancel={() => setRedeemAsk(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background.primary },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 120 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16, alignSelf: 'flex-start' },
  backLabel: { color: colors.text.secondary, fontSize: 15, fontWeight: '600' },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 8,
  },
  kicker: {
    color: colors.accent.gold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  kickerSep: {
    color: colors.text.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  kickerClockWrap: {
    flexShrink: 0,
  },
  kickerClock: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.accent.gold,
    letterSpacing: 0.6,
    fontVariant: ['tabular-nums'],
  },
  kickerCountLabel: {
    color: colors.text.tertiary,
    fontSize: 12,
    fontWeight: '600',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  title: { flex: 1, color: colors.text.primary, fontSize: 26, fontWeight: '800', lineHeight: 32 },
  sub: { color: colors.text.secondary, fontSize: 14, marginTop: 6 },
  missingCard: {
    marginTop: 28,
    backgroundColor: colors.background.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.primary,
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: 'center',
  },
  missingIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ECFDF3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  missingTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.text.primary,
    textAlign: 'center',
  },
  missingHint: {
    marginTop: 8,
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  missingCta: {
    marginTop: 20,
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.text.primary,
    backgroundColor: colors.accent.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missingCtaLabel: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: '#F5F7F6',
  },
  hero: {
    marginTop: 20,
    backgroundColor: colors.background.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: 16,
    overflow: 'hidden',
  },
  heroLabel: { color: colors.text.tertiary, fontSize: 13, fontWeight: '600' },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.background.secondary,
  },
  liveChipOn: {
    backgroundColor: '#ECFDF3',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.text.muted,
  },
  liveDotOn: { backgroundColor: colors.accent.gold },
  liveChipText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  liveChipTextOn: { color: colors.accent.goldDark },
  ranges: {
    flexDirection: 'row',
    marginTop: 10,
    backgroundColor: colors.background.secondary,
    borderRadius: 10,
    padding: 3,
  },
  rangeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
  },
  rangeChipOn: { backgroundColor: colors.background.card },
  rangeLabel: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.text.tertiary,
  },
  rangeLabelOn: { color: colors.text.primary, fontFamily: fonts.bold },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  legList: { marginTop: 18, gap: 8 },
  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.card,
  },
  legRowOn: {
    borderColor: colors.text.primary,
    backgroundColor: colors.background.secondary,
  },
  legDot: { width: 8, height: 8, borderRadius: 4 },
  legName: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text.primary,
  },
  legPct: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  quoteLine: {
    marginTop: 10,
    minHeight: 18,
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  actionSwitch: {
    flexDirection: 'row',
    marginTop: 22,
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: 3,
  },
  actionChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionChipSellOn: { backgroundColor: colors.status.error },
  actionChipMuted: { opacity: 0.42 },
  actionChipLabel: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text.secondary,
  },
  actionChipLabelOn: { color: '#FFFFFF' },
  actionChipLabelMuted: { color: colors.text.muted },
  modeMenu: {
    marginTop: 12,
    zIndex: 30,
    elevation: 30,
  },
  modeRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modeOption: {
    position: 'absolute',
    top: 36,
    left: 0,
    zIndex: 40,
    elevation: 12,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeToggleLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.text.tertiary,
  },
  modeToggleLabelOn: {
    color: colors.accent.goldDark,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  waitStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 36,
    minWidth: 132,
    justifyContent: 'flex-end',
  },
  waitBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitBtnMuted: { opacity: 0.35 },
  waitCents: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.text.primary,
    minWidth: 36,
    padding: 0,
    textAlign: 'center',
  },
  waitCentsHit: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 56,
    justifyContent: 'center',
  },
  waitCentsSuffix: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.text.primary,
  },
  redeemBtn: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  redeemLabel: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text.primary,
  },
  heldStack: {
    marginTop: 14,
    gap: 8,
  },
  heldCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.primary,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  heldKicker: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heldMain: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text.primary,
    marginTop: 2,
  },
  heldAvg: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 3,
  },
  heldWorking: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 4,
  },
  heldMax: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.accent.goldDark,
  },
  fieldHead: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  fieldLabel: {
    color: colors.text.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  availHint: {
    color: colors.text.tertiary,
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  availAmt: {
    color: colors.text.secondary,
    fontWeight: '600',
  },
  input: {
    marginTop: 8,
    backgroundColor: colors.background.secondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputError: { borderColor: colors.status.error },
  inputDollar: {
    color: colors.text.primary,
    fontSize: 22,
    fontWeight: '800',
    marginRight: 2,
    lineHeight: 28,
  },
  inputField: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 22,
    fontWeight: '800',
    padding: 0,
  },
  inputNum: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    lineHeight: 28,
  },
  inputUsdHint: {
    marginLeft: 'auto',
    color: colors.text.tertiary,
    fontSize: 13,
    fontWeight: '600',
  },
  quick: { flexDirection: 'row', gap: 8, marginTop: 10 },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.background.elevated,
  },
  quickOn: { borderWidth: 1, borderColor: colors.accent.gold },
  quickMuted: { opacity: 0.4 },
  quickLabel: { color: colors.text.primary, fontWeight: '700' },
  quickLabelMuted: { color: colors.text.muted },
  est: { color: colors.text.tertiary, fontSize: 13 },
  sizeError: {
    marginTop: 10,
    color: colors.status.error,
    fontSize: 13,
    fontWeight: '700',
  },
  estRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  estNum: {
    color: colors.text.tertiary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },
  hintSlot: {
    marginTop: 8,
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
  },
  toWin: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.primary,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  toWinCopy: { flex: 1, minWidth: 0 },
  toWinLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toWinLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text.primary,
  },
  toWinAvg: {
    marginTop: 3,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.text.tertiary,
  },
  toWinAmtCol: { alignItems: 'flex-end' },
  toWinAmtRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  toWinAmt: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    fontWeight: '800',
    color: colors.status.success,
    lineHeight: 32,
  },
  cta: {
    backgroundColor: YES_COLOR,
    borderRadius: 16,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBusy: { opacity: 0.7 },
  ctaLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  feeHint: {
    marginTop: 10,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.text.tertiary,
    lineHeight: 17,
  },
  waitingList: { marginTop: 16, gap: 8 },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.background.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  waitingText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.text.primary,
  },
  waitingCancelChip: {
    marginLeft: 8,
    minHeight: 22,
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#F43F5E18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingCancel: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    color: colors.status.error,
  },
});
