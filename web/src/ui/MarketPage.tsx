import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CANDLE_INTERVAL_MS,
  cancelOutcomeOrder,
  displayListedTitle,
  estimateBuyPayout,
  estimateSellPayout,
  formatMarketVolumeAmount,
  formatOutcomeCents,
  fetchOutcomeBook,
  fetchOutcomeOpenOrders,
  fetchLegCandleSamples,
  HIP4_CATALOG_STALE_MS,
  impliedPercent,
  listOutcomes,
  MIN_OUTCOME_NOTIONAL_USD,
  outcomeSellSharesForUsd,
  outcomeSharesForUsd,
  isOutcomeRailPx,
  pairedRedeemShares,
  placeOutcomeOrder,
  positionsFromSpotBalances,
  questionRedeemShares,
  questionSiblings,
  redeemOutcomePair,
  redeemQuestionBundle,
  fetchSpotClearinghouse,
  outcomeFreeShares,
  releaseOutcomeSellHolds,
  type ListedMarket,
  type OutcomeSide,
} from '@hip4';
import { isEconomicsCatalogMarket } from '@hip4/catalog';
import { fetchBuilderConfig, reportTrade } from '../lib/api';
import { useWebAuth } from '../lib/auth';
import { formatBuilderPercent } from '../lib/builderFee';
import { BUILDER_FEE_TENTHS } from '../lib/config';
import { interpolate, tHip4, useCopy } from '../lib/copy';
import {
  extractHyperliquidErrorText,
  humanizeHyperliquidErrorWith,
} from '../../../frontend/src/lib/hyperliquidErrorMatch';
import { useMarketStream } from '../lib/useMarketStream';
import { useSpotAccount } from '../lib/useSpotAccount';
import {
  inspectWebSetup,
  prepareWebAccount,
  fetchHlUsdBalances,
  readCachedWebSetup,
} from '../lib/webKernel';
import { formatEndDate, formatHms, looksLikeScheduleSubtitle } from './formatTime';
import { IconCash } from './icons';
import { MarketActivity } from './MarketActivity';
import {
  OrderTicketModal,
  type OrderTicketError,
  type OrderTicketPayload,
  type OrderTicketStatus,
} from './OrderTicketModal';
import { MarketPageSkeleton, Skel } from './skeleton';
import { ProbabilityChart, type ProbSeries } from './ProbabilityChart';
import { WEB_CHART_RANGES, type WebChartRangeId } from './chartRanges';
import { LEG_PALETTE, NO_COLOR, YES_COLOR } from './outcomeColors';
import { RollingNumber } from './RollingNumber';
import { ShareMarketButton } from './ShareMarketButton';

const QUICK_USD = [10, 25, 50, 100] as const;

/** Limit field is labeled ¢ — always cents (1–99), never 0–1 probability. */
function parseLimitCents(raw: string): number | null {
  const n = Number(String(raw).replace(/[¢cC,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseLimitPx(raw: string): number | null {
  const n = parseLimitCents(raw);
  if (n == null || n < 1 || n > 99) return null;
  const px = n / 100;
  if (!(px > 0) || px >= 1) return null;
  return Math.min(0.99, Math.max(0.01, px));
}

function isLimitPxInvalid(raw: string): boolean {
  const trimmed = String(raw).replace(/[¢cC,\s]/g, '');
  if (!trimmed) return false;
  const n = parseLimitCents(trimmed);
  return n == null || n < 1 || n > 99;
}

function looksLikePipeMeta(s: string): boolean {
  return /\|/.test(s) && /[a-z]+:/i.test(s);
}

function fmtShares(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function MarketPage() {
  const { common: commonCopy, hip4, fees: feesCopy } = useCopy();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // First history entry (shared link, new tab) has key "default" — back would leave the site.
  const location = useLocation();
  const canGoBack = location.key !== 'default';
  const [params] = useSearchParams();
  const { authenticated, getAccessToken, address, getProvider, login, hydrating, signingReady } =
    useWebAuth();
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [action, setAction] = useState<'buy' | 'sell'>('buy');
  const [usd, setUsd] = useState('0');
  const [sellAll, setSellAll] = useState(false);
  const [limit, setLimit] = useState(false);
  const [limitPx, setLimitPx] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ticket, setTicket] = useState<{
    phase: 'confirm' | 'receipt' | 'error';
    outcomeId: number;
    side: OutcomeSide;
    sizeUsd: number;
    orderType: 'market' | 'limit';
    limitPx?: number;
    status?: OrderTicketStatus;
    error?: OrderTicketError;
    payload: OrderTicketPayload;
  } | null>(null);
  const [rangeId, setRangeId] = useState<WebChartRangeId>('1d');
  const frozenSeries = useRef<ProbSeries[]>([]);

  const catalog = useQuery({
    queryKey: ['hip4', 'outcomes'],
    queryFn: () => listOutcomes({ filter: 'all' }),
    staleTime: HIP4_CATALOG_STALE_MS,
  });
  const market = useMemo(
    () => (catalog.data ?? []).find((m) => m.id === id || String(m.outcomeId) === id) ?? null,
    [catalog.data, id],
  );
  const siblings = useMemo(
    () => (market && catalog.data ? questionSiblings(catalog.data, market) : []),
    [catalog.data, market],
  );
  const multiLeg = siblings.length > 1;

  const streamLegs = useMemo(() => {
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

  useEffect(() => {
    if (!market) return;
    if (multiLeg) {
      setSelectedKey(`${market.outcomeId}:0`);
      return;
    }
    setSelectedKey(`${market.outcomeId}:${params.get('side') === '1' ? 1 : 0}`);
  }, [market?.outcomeId, multiLeg]);

  const resolvedKey =
    selectedKey && streamLegs.some((l) => l.key === selectedKey)
      ? selectedKey
      : (streamLegs[0]?.key ?? null);
  const selectedLeg = streamLegs.find((l) => l.key === resolvedKey) ?? streamLegs[0];
  const selectedMarket = multiLeg
    ? (siblings.find((m) => m.outcomeId === selectedLeg?.outcomeId) ?? market)
    : market;
  const side: OutcomeSide = selectedLeg?.side ?? 0;

  const stream = useMarketStream(streamLegs, !!market);
  const spot = useSpotAccount(address, authenticated);
  const positions = useMemo(
    () => (address ? positionsFromSpotBalances(spot.balances, catalog.data ?? []) : []),
    [address, spot.balances, catalog.data],
  );
  const heldOnMarket = useMemo(() => {
    if (!market) return [];
    const ids = new Set(multiLeg ? siblings.map((s) => s.outcomeId) : [market.outcomeId]);
    return positions.filter((p) => ids.has(p.outcomeId) && p.shares > 0);
  }, [market, multiLeg, siblings, positions]);

  const selected = selectedMarket?.sides.find((s) => s.side === side) ?? selectedMarket?.sides[0];
  const livePx = stream.midsByKey[resolvedKey ?? ''] ?? selected?.probability ?? null;
  const bbo = stream.bboByKey[resolvedKey ?? ''];
  const askPx = bbo?.ask ?? null;
  const bidPx = bbo?.bid ?? null;
  const quoteKey = resolvedKey ?? '';
  const stickyQuote = useRef({ key: '', bid: null as number | null, ask: null as number | null });
  const usableBid = bidPx != null && !isOutcomeRailPx(bidPx) ? bidPx : null;
  const usableAsk = askPx != null && !isOutcomeRailPx(askPx) ? askPx : null;
  if (stickyQuote.current.key !== quoteKey) {
    stickyQuote.current = { key: quoteKey, bid: usableBid, ask: usableAsk };
  } else {
    if (usableBid != null) stickyQuote.current.bid = usableBid;
    if (usableAsk != null) stickyQuote.current.ask = usableAsk;
  }
  const quoteAsk = usableAsk ?? stickyQuote.current.ask ?? livePx;
  const quoteBid = usableBid ?? stickyQuote.current.bid ?? livePx;
  const quotePx = action === 'buy' ? quoteAsk : quoteBid;
  const quoteReady = quoteBid != null || quoteAsk != null;

  const bookQ = useQuery({
    queryKey: ['hip4', 'book', selectedLeg?.outcomeId, selectedLeg?.side],
    queryFn: () => fetchOutcomeBook(selectedLeg!.outcomeId, selectedLeg!.side),
    enabled: !!selectedLeg && selectedMarket?.status === 'live',
    refetchInterval: 4000,
  });

  const range = WEB_CHART_RANGES.find((r) => r.id === rangeId) ?? WEB_CHART_RANGES[2];
  const legsKey = streamLegs.map((l) => l.key).join(',');

  const chartQ = useQuery({
    queryKey: ['hip4', 'candles', legsKey, range.id],
    enabled: streamLegs.length > 0,
    queryFn: () => {
      const end = Date.now();
      return fetchLegCandleSamples(streamLegs, range.interval, end - range.spanMs, end);
    },
    staleTime: 15_000,
    refetchInterval: range.interval === '1m' ? 20_000 : 45_000,
  });

  useEffect(() => {
    if (!legsKey || streamLegs.length === 0 || chartQ.isPending) return;
    const handle = setTimeout(() => {
      for (const r of WEB_CHART_RANGES) {
        if (r.id === range.id) continue;
        void qc.prefetchQuery({
          queryKey: ['hip4', 'candles', legsKey, r.id],
          staleTime: 15_000,
          queryFn: () => {
            const end = Date.now();
            return fetchLegCandleSamples(streamLegs, r.interval, end - r.spanMs, end);
          },
        });
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [legsKey, range.id, chartQ.isPending, qc, streamLegs]);

  const ordersQ = useQuery({
    queryKey: ['hip4', 'open-orders', address],
    queryFn: () => fetchOutcomeOpenOrders(address!),
    enabled: !!address,
  });

  const heldRow = positions.find(
    (p) => p.outcomeId === selectedMarket?.outcomeId && p.side === side,
  );
  const heldShares = heldRow?.shares ?? 0;
  const freeShares = heldRow?.availableShares ?? heldShares;
  const heldOnOrder = Math.max(0, heldShares - freeShares);
  const heldValue = heldRow?.valueUsd ?? 0;
  const canSell = heldShares >= 1;
  const usdcAvailable = spot.spendable;
  const buyMaxUsd = Math.floor(Math.max(0, usdcAvailable) * 100) / 100;
  const usdN = Number(usd);
  const selectedName = multiLeg
    ? selectedMarket?.legLabel || selected?.name || hip4.yes
    : (selected?.name ?? (side === 0 ? hip4.yes : hip4.no));
  const waitPx = parseLimitPx(limitPx);
  const limitInvalid = limit && isLimitPxInvalid(limitPx);
  const sizingPx = limit ? (waitPx ?? quotePx) : quotePx;
  const sellShares =
    action === 'sell' && sellAll && heldShares >= 1
      ? heldShares
      : Number.isFinite(usdN) && usdN > 0 && sizingPx
        ? outcomeSellSharesForUsd(usdN, sizingPx, freeShares)
        : 0;
  const buyShares =
    Number.isFinite(usdN) && usdN > 0 && sizingPx ? outcomeSharesForUsd(usdN, sizingPx) : 0;
  const shares = action === 'sell' ? sellShares : buyShares;
  const closingAll =
    action === 'sell' && heldShares > 0 && (sellAll || sellShares + 1e-9 >= heldShares);
  const residualClose = action === 'sell' && canSell && closingAll;
  const belowMin =
    Number.isFinite(usdN) &&
    usdN > 0 &&
    usdN + 1e-9 < MIN_OUTCOME_NOTIONAL_USD &&
    !residualClose &&
    (action === 'buy' || canSell);
  const overBalance =
    authenticated &&
    spot.hydrated &&
    action === 'buy' &&
    Number.isFinite(usdN) &&
    usdN > 0 &&
    usdN > usdcAvailable + 0.01;
  const sizeBlocked = belowMin || overBalance;

  useEffect(() => {
    if (action === 'sell' && !canSell) setAction('buy');
  }, [canSell, action]);

  const buyPayout = useMemo(
    () =>
      action === 'buy'
        ? estimateBuyPayout({
            usd: usdN,
            book: limit ? null : bookQ.data,
            limitPx: limit ? waitPx : null,
            fallbackPx: quotePx,
          })
        : null,
    [action, usdN, limit, waitPx, bookQ.data, quotePx],
  );
  const sellPayout = useMemo(
    () =>
      action === 'sell' && shares > 0
        ? estimateSellPayout({
            shares,
            book: limit ? null : bookQ.data,
            limitPx: limit ? waitPx : null,
            fallbackPx: quotePx,
          })
        : null,
    [action, shares, limit, waitPx, bookQ.data, quotePx],
  );
  const payout = action === 'buy' ? buyPayout : sellPayout;

  useEffect(() => {
    if (!limit) return;
    const seed = (action === 'buy' ? quoteAsk : quoteBid) ?? livePx;
    if (seed == null || !(seed > 0) || isOutcomeRailPx(seed)) return;
    setLimitPx(String(Math.min(99, Math.max(1, Math.round(seed * 100)))));
    // Seed once per mode/leg — not on every BBO tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- live BBO omitted so we don't overwrite a typed price
  }, [limit, action, selectedLeg?.key]);

  const setupQ = useQuery({
    queryKey: ['hip4', 'setup', address],
    queryFn: () => inspectWebSetup(address!),
    enabled: !!address && authenticated && signingReady,
    staleTime: 30_000,
    placeholderData: (previous) =>
      previous ?? (address ? readCachedWebSetup(address) : undefined),
  });
  const liveSetup =
    signingReady && setupQ.isFetched && !setupQ.isPlaceholderData ? setupQ.data : undefined;
  const feeQ = useQuery({
    queryKey: ['api', 'builder-config', address],
    queryFn: () => fetchBuilderConfig(address ?? undefined),
  });
  const sellFeeTenths =
    typeof feeQ.data?.fee === 'number'
      ? Math.min(Math.max(0, Math.floor(feeQ.data.fee)), BUILDER_FEE_TENTHS)
      : BUILDER_FEE_TENTHS;
  const sellFeeLabel = formatBuilderPercent(sellFeeTenths, feesCopy.free);

  type PlaceVars = {
    outcomeId: number;
    side: OutcomeSide;
    tradeSide: 'buy' | 'sell';
    sizeUsd: number;
    sizeShares?: number;
    skipMinNotional: boolean;
    orderType: 'market' | 'limit';
    limitPx?: number;
    referencePx?: number;
  };

  const trade = useMutation({
    mutationFn: async (vars: PlaceVars) => {
      setErr(null);
      if (!address) throw new Error(hip4.header.signIn);
      const provider = await getProvider();
      if (!provider) throw new Error('Wallet not ready');
      await prepareWebAccount(provider, address, setupQ.data);
      await qc.invalidateQueries({ queryKey: ['hip4', 'setup'] });
      if (vars.tradeSide === 'buy') {
        const bals = await fetchHlUsdBalances(address);
        const spendable = bals.spendable;
        if (vars.sizeUsd > spendable + 0.01) {
          throw new Error(
            spendable > 0.005
              ? interpolate(hip4.ticket.youHaveUsdc, { amount: spendable.toFixed(2) })
              : hip4.ticket.notEnoughUsdc,
          );
        }
      }
      let sizeShares = vars.sizeShares;
      let skipMinNotional = vars.skipMinNotional;
      if (vars.tradeSide === 'sell') {
        if (vars.skipMinNotional) {
          sizeShares = await releaseOutcomeSellHolds({
            user: address,
            outcomeId: vars.outcomeId,
            side: vars.side,
          });
          skipMinNotional = true;
          void qc.invalidateQueries({ queryKey: ['hip4', 'open-orders'] });
        } else {
          const spotNow = await fetchSpotClearinghouse(address);
          const free = outcomeFreeShares(spotNow.balances, vars.outcomeId, vars.side);
          if (sizeShares != null && sizeShares > free + 1e-9) {
            sizeShares = Math.floor(free + 1e-12);
          }
        }
        if (!(sizeShares != null && sizeShares >= 1)) {
          throw new Error(hip4.ticket.noFreeShares);
        }
      }
      const result = await placeOutcomeOrder({
        outcomeId: vars.outcomeId,
        side: vars.side,
        tradeSide: vars.tradeSide,
        orderType: vars.orderType,
        sizeUsd: vars.sizeUsd,
        sizeShares: vars.tradeSide === 'sell' ? sizeShares : undefined,
        skipMinNotional,
        limitPx: vars.orderType === 'limit' ? vars.limitPx : undefined,
        referencePx: vars.referencePx,
      });
      const token = await getAccessToken();
      if (token) await reportTrade(address, token).catch(() => undefined);
      return result;
    },
    onSuccess: (result, vars) => {
      void qc.invalidateQueries({ queryKey: ['hip4'] });
      // Flip the ticket to its receipt phase with what actually filled.
      setTicket((t) => {
        if (!t) return t;
        const sentShares =
          vars.tradeSide === 'sell' ? (vars.sizeShares ?? t.payload.shares) : t.payload.shares;
        const filled =
          result.filledShares != null && result.filledShares > 0 ? result.filledShares : sentShares;
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
        t
          ? { ...t, phase: 'error', error: { title: nice.title, message: nice.message } }
          : t,
      );
      setErr(nice.message);
    },
  });

  // Confirm phase of a market order: price/shares follow the live book (same as the app).
  const liveTicketPayload = useMemo((): OrderTicketPayload | null => {
    if (!ticket) return null;
    if (ticket.phase !== 'confirm' || trade.isPending || ticket.orderType === 'limit') {
      return ticket.payload;
    }
    const sameLeg =
      selectedLeg?.outcomeId === ticket.outcomeId && selectedLeg?.side === ticket.side;
    const liveQuote = ticket.payload.tradeSide === 'buy' ? quoteAsk : quoteBid;
    const px = (sameLeg ? liveQuote : null) ?? ticket.payload.px;
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
      return { ...ticket.payload, px, shares: heldShares, usd: heldShares * px, closingAll: true };
    }
    const liveShares = outcomeSellSharesForUsd(ticket.sizeUsd, px, freeShares);
    return {
      ...ticket.payload,
      px,
      shares: liveShares,
      usd: liveShares * px,
      closingAll: heldShares > 0 && liveShares >= heldShares - 1e-9,
    };
  }, [ticket, trade.isPending, selectedLeg, quoteAsk, quoteBid, heldShares, freeShares]);

  // Confirm pressed: freeze the reviewed quote and send the order.
  const placeReviewed = () => {
    if (!ticket || ticket.phase !== 'confirm' || trade.isPending) return;
    const quote = liveTicketPayload ?? ticket.payload;
    const px = quote.px ?? ticket.payload.px;
    const shares = quote.shares ?? ticket.payload.shares;
    if (px == null || !(px > 0) || shares < 1) {
      setErr(hip4.ticket.priceMoved);
      setTicket(null);
      return;
    }
    const tradeSide = ticket.payload.tradeSide;
    const closingAll = quote.closingAll ?? ticket.payload.closingAll;
    const sellSharesOut = tradeSide === 'sell' && closingAll && heldShares >= 1 ? heldShares : shares;
    const frozen: OrderTicketPayload = {
      ...ticket.payload,
      px,
      shares: sellSharesOut,
      usd: tradeSide === 'sell' ? sellSharesOut * px : ticket.sizeUsd,
      closingAll,
    };
    setTicket({ ...ticket, payload: frozen });
    trade.mutate({
      outcomeId: ticket.outcomeId,
      side: ticket.side,
      tradeSide,
      sizeUsd: ticket.sizeUsd,
      sizeShares: tradeSide === 'sell' ? sellSharesOut : undefined,
      skipMinNotional: tradeSide === 'sell' && closingAll,
      orderType: ticket.orderType,
      limitPx: ticket.orderType === 'limit' ? ticket.limitPx : undefined,
      referencePx: px,
    });
  };

  const accentFor = (index: number, s: OutcomeSide): string => {
    if (multiLeg) return LEG_PALETTE[index % LEG_PALETTE.length];
    return s === 0 ? YES_COLOR : NO_COLOR;
  };

  const liveProb = (leg: (typeof streamLegs)[number]) =>
    stream.midsByKey[leg.key] ?? leg.seed ?? null;

  const rangePending = chartQ.isPending;
  const chartSeries = useMemo(() => {
    const now = Date.now();
    const bucket = CANDLE_INTERVAL_MS[range.interval];
    return streamLegs.map((leg, i) => {
      const hist = rangePending ? [] : (chartQ.data?.[leg.key] ?? []);
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
        ? (siblings.find((m) => m.outcomeId === leg.outcomeId)?.legLabel ?? hip4.yes)
        : leg.side === 0
          ? (market?.sides[0]?.name ?? hip4.yes)
          : (market?.sides[1]?.name ?? hip4.no);
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
    chartQ.data,
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

  const pickLeg = (key: string) => {
    const leg = streamLegs.find((l) => l.key === key);
    if (!leg || !market) return;
    setSelectedKey(key);
    if (multiLeg) {
      const next = siblings.find((m) => m.outcomeId === leg.outcomeId);
      if (next && next.id !== market.id) navigate(`/market/${next.id}`);
    }
  };

  const pickAction = (next: 'buy' | 'sell') => {
    const sellLocked = next === 'sell' && !canSell;
    if (sellLocked) {
      setErr(interpolate(hip4.ticket.dontHold, { name: selectedName }));
      return;
    }
    setErr(null);
    setAction(next);
    if (next === 'buy') setSellAll(false);
    if (
      next === 'sell' &&
      heldValue > 0 &&
      heldValue + 1e-9 < MIN_OUTCOME_NOTIONAL_USD &&
      quoteBid
    ) {
      setSellAll(true);
      setUsd((heldShares * quoteBid).toFixed(2));
    }
  };

  const setSellMax = () => {
    const px = quoteBid ?? livePx;
    if (!px || heldShares < 1) return;
    setErr(null);
    setAction('sell');
    setSellAll(true);
    setUsd((heldShares * px).toFixed(2));
  };

  const sellHeldPosition = (p: (typeof positions)[number]) => {
    pickLeg(`${p.outcomeId}:${p.side}`);
    const key = `${p.outcomeId}:${p.side}`;
    const bbo = stream.bboByKey[key];
    const bid = bbo?.bid != null && !isOutcomeRailPx(bbo.bid) ? bbo.bid : p.probability;
    if (!bid || p.shares < 1) return;
    setErr(null);
    setAction('sell');
    setSellAll(true);
    setUsd((p.shares * bid).toFixed(2));
  };

  if (catalog.isLoading && !market) return <MarketPageSkeleton />;
  if (!market || !selectedMarket) return <p className="font-bold">{hip4.ticket.missing}</p>;

  const statusLabel =
    market.status === 'live'
      ? hip4.status.live
      : market.status === 'upcoming'
        ? hip4.status.upcoming
        : hip4.status.settled;
  const remain =
    market.expiresAt && market.expiresAt > Date.now()
      ? formatHms((market.expiresAt - Date.now()) / 1000)
      : null;
  const heading = multiLeg
    ? market.questionName || displayListedTitle(market)
    : displayListedTitle(market);
  const subtitle = multiLeg
    ? hip4.ticket.mutuallyExclusiveOutcomes
    : market.subtitle &&
        !looksLikePipeMeta(market.subtitle) &&
        !isEconomicsCatalogMarket(market) &&
        !looksLikeScheduleSubtitle(market.subtitle, market.expiresAt)
      ? market.subtitle
      : '';
  const volumeUsd = multiLeg
    ? siblings.reduce((sum, m) => sum + (m.volumeUsd || 0), 0)
    : market.volumeUsd;
  const vol = formatMarketVolumeAmount(volumeUsd);
  const questionIds = new Set(siblings.map((s) => s.outcomeId));
  const waitingOrders = (ordersQ.data ?? []).filter((o) => questionIds.has(o.outcomeId));
  const printNames: Record<number, string> = {};
  if (multiLeg) {
    for (const m of siblings) printNames[m.outcomeId] = m.legLabel;
  }

  // Limit mode: the CTA quotes the resting price ("Limit · 45¢") like the app,
  // instead of an instant-sounding "Close all Yes" / "Buy Yes".
  const limitCents = waitPx != null ? Number((waitPx * 100).toFixed(1)) : null;
  const showSellShares = action === 'sell' && sellAll && heldShares >= 1;
  const maxSellUsd = showSellShares && sizingPx ? heldShares * sizingPx : 0;

  // Validate the ticket and open the review modal — nothing is sent until Confirm.
  const openTicket = () => {
    setErr(null);
    if (!selectedLeg) return;
    if (!showSellShares && (!Number.isFinite(usdN) || usdN <= 0)) {
      setErr(hip4.ticket.enterSizeToast);
      return;
    }
    const waiting = limit;
    const px = waiting ? waitPx : quotePx;
    if (waiting && (limitInvalid || px == null || !(px > 0))) {
      setErr(hip4.ticket.limitRange);
      return;
    }
    if (px == null || !(px > 0)) {
      setErr(hip4.ticket.noLivePrice);
      return;
    }
    if (action === 'sell' && heldShares < 1) {
      setErr(interpolate(hip4.ticket.dontHold, { name: selectedName }));
      return;
    }
    const nextSellShares =
      action === 'sell'
        ? sellAll && heldShares >= 1
          ? heldShares
          : outcomeSellSharesForUsd(usdN, px, freeShares)
        : 0;
    const nextShares = action === 'sell' ? nextSellShares : outcomeSharesForUsd(usdN, px);
    if (action === 'sell' && nextSellShares < 1) {
      setErr(heldOnOrder >= 1 && !sellAll ? hip4.ticket.noFreeShares : hip4.ticket.sizeTooSmallSell);
      return;
    }
    if (nextShares < 1) {
      setErr(hip4.ticket.sizeTooSmall);
      return;
    }
    const nextClosingAll =
      action === 'sell' && heldShares > 0 && (sellAll || nextSellShares >= heldShares - 1e-9);
    const legIndex = Math.max(
      0,
      streamLegs.findIndex((l) => l.key === resolvedKey),
    );
    setTicket({
      phase: 'confirm',
      outcomeId: selectedMarket.outcomeId,
      side,
      sizeUsd: usdN,
      orderType: waiting ? 'limit' : 'market',
      limitPx: waiting ? px : undefined,
      payload: {
        tradeSide: action,
        sideName: selectedName,
        heading,
        shares: nextShares,
        usd: action === 'sell' ? nextShares * px : usdN,
        px,
        accent: accentFor(legIndex, side),
        closingAll: nextClosingAll,
        wait: waiting,
        fillHint: !waiting && payout?.short ? hip4.ticket.fillShort : undefined,
      },
    });
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => (canGoBack ? navigate(-1) : navigate('/markets'))}
            className="bg-transparent p-0 text-sm font-semibold text-[var(--text-2)]"
          >
            ← {canGoBack ? commonCopy.goBack : hip4.ticket.back}
          </button>
          <ShareMarketButton marketId={market.id} title={heading} />
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-2 text-xs font-bold tracking-wide">
          <span className="uppercase text-[var(--accent)]">{statusLabel}</span>
          {remain ? (
            <>
              <span className="text-[var(--text-3)]">·</span>
              <span className="tabular-nums text-[var(--accent)]">{remain}</span>
              <span className="font-semibold text-[var(--text-3)]">{hip4.status.endsIn}</span>
            </>
          ) : null}
          <span className="ml-auto font-semibold normal-case text-[var(--text-3)]">
            {stream.connected ? hip4.status.live : hip4.status.connecting}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold">{heading}</h1>
        {subtitle ? <p className="mt-1 text-sm text-[var(--text-2)]">{subtitle}</p> : null}

        <div className="mt-4">
          <ProbabilityChart
            series={displaySeries}
            loading={rangePending}
            rangeId={rangeId}
            onRange={setRangeId}
            onSelect={pickLeg}
            title={multiLeg ? hip4.ticket.outcomeChances : hip4.ticket.yesNoChances}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold text-[var(--text-2)]">
          {vol ? <span>{interpolate(hip4.row.volume, { amount: vol })}</span> : null}
          {market.expiresAt ? <span>{formatEndDate(market.expiresAt)}</span> : null}
        </div>
      </div>

      <aside className="h-fit rounded-2xl border border-[var(--border)] bg-white p-5 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-20">
        {selectedMarket.status === 'settled' ? (
          <p className="font-bold">{hip4.ticket.settled}</p>
        ) : (
          <>
            {multiLeg ? (
              <div className="space-y-1.5">
                {streamLegs.map((leg, i) => {
                  const m = siblings.find((s) => s.outcomeId === leg.outcomeId);
                  const on = leg.key === resolvedKey;
                  const px = liveProb(leg);
                  return (
                    <button
                      key={leg.key}
                      type="button"
                      onClick={() => pickLeg(leg.key)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left ${
                        on ? 'border-[var(--ink)] bg-[var(--bg)]' : 'border-[var(--border)] bg-white'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: accentFor(i, leg.side) }}
                        />
                        <span className="truncate text-[13px] font-bold">{m?.legLabel ?? hip4.yes}</span>
                      </span>
                      <span
                        className="text-[13px] font-extrabold tabular-nums"
                        style={{ color: accentFor(i, leg.side) }}
                      >
                        {impliedPercent(px)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {streamLegs.map((leg) => {
                  const name = leg.side === 0 ? (market.sides[0]?.name ?? hip4.yes) : (market.sides[1]?.name ?? hip4.no);
                  return (
                    <button
                      key={leg.key}
                      type="button"
                      onClick={() => pickLeg(leg.key)}
                      aria-pressed={leg.key === resolvedKey}
                      className={`btn-stamp py-3.5 text-base ${leg.side === 0 ? 'btn-yes' : 'btn-no'}`}
                    >
                      {name} {impliedPercent(liveProb(leg))}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              {(['buy', 'sell'] as const).map((a) => {
                const on = action === a;
                const sellLocked = a === 'sell' && !canSell;
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => pickAction(a)}
                    className={`flex-1 rounded-xl py-2 text-[13px] font-extrabold ${
                      on
                        ? a === 'sell'
                          ? 'bg-[var(--danger)] text-white'
                          : 'bg-[var(--ink)] text-[#F5F7F6]'
                        : 'bg-[var(--bg-2)] text-[var(--text-2)]'
                    } ${sellLocked ? 'cursor-default opacity-[0.42]' : ''}`}
                  >
                    {a === 'buy' ? hip4.ticket.buy : hip4.ticket.sell}
                  </button>
                );
              })}
            </div>
            {heldOnMarket.length > 0 ? (
              <div className="mt-3 space-y-2">
                {heldOnMarket.map((p) => {
                  const name = multiLeg
                    ? siblings.find((s) => s.outcomeId === p.outcomeId)?.legLabel || p.sideName
                    : p.sideName;
                  const onOrder = Math.max(0, p.shares - (p.availableShares ?? p.shares));
                  return (
                    <button
                      key={`${p.outcomeId}:${p.side}`}
                      type="button"
                      onClick={() => sellHeldPosition(p)}
                      className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-left"
                    >
                      <span>
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--text-3)]">
                          {interpolate(hip4.ticket.yourPosition, { name })}
                        </span>
                        <span className="text-[13px] font-extrabold">
                          {interpolate(hip4.ticket.sharesLine, { shares: fmtShares(p.shares) })}
                          {p.valueUsd > 0 ? ` · $${p.valueUsd.toFixed(2)}` : ''}
                        </span>
                        {p.avgCost != null && p.avgCost > 0 ? (
                          <span className="mt-0.5 block text-[11px] font-semibold text-[var(--text-3)]">
                            {interpolate(hip4.ticket.avgEntry, {
                              cents: formatOutcomeCents(p.avgCost),
                            })}
                          </span>
                        ) : null}
                        {onOrder >= 1 ? (
                          <span className="mt-0.5 block text-[11px] font-semibold text-[var(--text-2)]">
                            {interpolate(hip4.ticket.workingSellHint, { shares: fmtShares(onOrder) })}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[11px] font-extrabold text-[var(--accent-dark)]">
                        {hip4.ticket.max}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <p className="mt-3 text-xs text-[var(--text-3)]">
              {interpolate(hip4.ticket.feeHint, { rate: sellFeeLabel })}
            </p>
            <div className="mt-4 flex items-baseline justify-between gap-2">
              <label className="text-xs font-bold text-[var(--text-2)]">
                {showSellShares
                  ? hip4.ticket.sellSizeSharesLabel
                  : action === 'sell'
                    ? hip4.ticket.sellSizeLabel
                    : hip4.ticket.sizeLabel}
              </label>
              <span className="truncate text-[11px] text-[var(--text-3)]">
                {hip4.ticket.available}{' '}
                <span className="font-bold text-[var(--text)]">
                  {authenticated
                    ? action === 'sell'
                      ? interpolate(hip4.ticket.availableShares, {
                          shares: fmtShares(freeShares),
                          name: selectedName,
                        })
                      : `$${usdcAvailable.toFixed(2)}`
                    : '—'}
                </span>
              </span>
            </div>
            <div className="relative mt-1">
              <input
                value={showSellShares ? fmtShares(heldShares) : usd}
                onChange={(e) => {
                  setErr(null);
                  setSellAll(false);
                  setUsd(e.target.value);
                }}
                className={`w-full rounded-xl border px-3 py-2 text-sm ${
                  showSellShares ? 'pr-24' : ''
                } ${sizeBlocked ? 'border-[var(--danger)]' : 'border-[var(--border)]'}`}
              />
              {showSellShares && maxSellUsd > 0 ? (
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-[var(--text-3)]">
                  {interpolate(hip4.ticket.approxUsd, { amount: maxSellUsd.toFixed(2) })}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_USD.map((n) => {
                const chipOver = authenticated && action === 'buy' && n > usdcAvailable + 0.01;
                const on = usd === String(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setErr(null);
                      setSellAll(false);
                      setUsd(String(n));
                    }}
                    className={`min-w-[52px] flex-1 rounded-lg border py-1.5 text-[11px] font-extrabold ${
                      on
                        ? 'border-[var(--ink)] text-[var(--text)]'
                        : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--ink)] hover:text-[var(--text)]'
                    } ${chipOver ? 'opacity-40' : ''}`}
                  >
                    ${n}
                  </button>
                );
              })}
              {action === 'buy' && authenticated && buyMaxUsd > 0.005 ? (
                <button
                  type="button"
                  onClick={() => {
                    setErr(null);
                    setSellAll(false);
                    setUsd(buyMaxUsd.toFixed(2));
                  }}
                  className={`min-w-[52px] flex-1 rounded-lg border py-1.5 text-[11px] font-extrabold ${
                    Math.abs(usdN - buyMaxUsd) < 0.005
                      ? 'border-[var(--ink)] text-[var(--text)]'
                      : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--ink)] hover:text-[var(--text)]'
                  }`}
                >
                  {hip4.ticket.max}
                </button>
              ) : heldShares > 0 ? (
                <button
                  type="button"
                  onClick={setSellMax}
                  className={`min-w-[52px] flex-1 rounded-lg border py-1.5 text-[11px] font-extrabold ${
                    closingAll
                      ? 'border-[var(--ink)] text-[var(--text)]'
                      : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--ink)] hover:text-[var(--text)]'
                  }`}
                >
                  {hip4.ticket.max}
                </button>
              ) : null}
            </div>
            {overBalance ? (
              <p className="mt-2 text-xs font-semibold text-[var(--danger)]">
                {usdcAvailable > 0.005
                  ? interpolate(hip4.ticket.notEnoughUsdcAvail, { amount: usdcAvailable.toFixed(2) })
                  : hip4.ticket.notEnoughUsdc}
              </p>
            ) : belowMin ? (
              <p className="mt-2 text-xs font-semibold text-[var(--danger)]">
                {interpolate(hip4.ticket.minSize, { min: MIN_OUTCOME_NOTIONAL_USD })}
              </p>
            ) : shares > 0 ? (
              <p className="mt-2 text-xs text-[var(--text-3)]">
                {action === 'sell' ? hip4.ticket.sells : hip4.ticket.approx}
                {fmtShares(shares)}
                {action === 'sell' && heldShares > 0
                  ? interpolate(hip4.ticket.ofShares, {
                      held: fmtShares(heldShares),
                      name: selectedName,
                    })
                  : interpolate(hip4.ticket.sharesAt, { name: selectedName })}
                {action === 'buy' && livePx != null ? `${Math.round(livePx * 100)}%` : ''}
              </p>
            ) : (
              <p className="mt-2 text-xs text-[var(--text-3)]">
                {action === 'sell' && canSell && heldValue + 1e-9 < MIN_OUTCOME_NOTIONAL_USD
                  ? hip4.ticket.leftoverUnderMin
                  : interpolate(hip4.ticket.minSize, { min: MIN_OUTCOME_NOTIONAL_USD })}
              </p>
            )}
            <label className="mt-3 flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={limit} onChange={(e) => setLimit(e.target.checked)} />
              {hip4.ticket.wait}
            </label>
            {limit ? (
              <>
                <div className="relative mt-2">
                  <input
                    value={limitPx}
                    onChange={(e) => {
                      setErr(null);
                      setLimitPx(e.target.value.replace(/[^\d.]/g, ''));
                    }}
                    inputMode="decimal"
                    placeholder={livePx != null ? String(Math.round(livePx * 100)) : '45'}
                    className={`w-full rounded-xl border px-3 py-2 pr-8 text-sm ${
                      limitInvalid ? 'border-[var(--danger)]' : 'border-[var(--border)]'
                    }`}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-bold text-[var(--text-3)]">
                    ¢
                  </span>
                </div>
                {limitInvalid ? (
                  <p className="mt-2 text-xs font-semibold text-[var(--danger)]">
                    {hip4.ticket.limitRange}
                  </p>
                ) : null}
              </>
            ) : null}
            <p className="mt-2 flex h-4 items-center text-xs tabular-nums text-[var(--text-3)]">
              {quoteReady ? (
                <span>
                  Bid {quoteBid != null ? `${(quoteBid * 100).toFixed(1)}¢` : '—'} · Ask{' '}
                  {quoteAsk != null ? `${(quoteAsk * 100).toFixed(1)}¢` : '—'}
                </span>
              ) : (
                <Skel className="h-3 w-[148px]" />
              )}
            </p>
            {payout ? (
              <div className="mt-4 flex items-start justify-between gap-3 border-t border-[var(--border)] pt-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-bold">
                    {action === 'buy' ? hip4.ticket.toWin : hip4.ticket.youGet}
                    <IconCash size={16} className="text-[var(--yes)]" />
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-3)]">
                    {interpolate(hip4.ticket.avgPrice, { cents: formatOutcomeCents(payout.avgPx) })}
                  </p>
                </div>
                <p className="flex items-end text-2xl font-extrabold leading-none text-[var(--yes)]">
                  <span>$</span>
                  <RollingNumber
                    value={payout.toWinUsd}
                    format={(n) =>
                      n.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    }
                    durationMs={420}
                    emptyText="0.00"
                  />
                </p>
              </div>
            ) : null}
            {payout?.short ? (
              <p className="mt-2 text-xs text-[var(--text-2)]">{hip4.ticket.fillShort}</p>
            ) : null}
            {err && !ticket ? <p className="mt-2 text-xs text-[var(--danger)]">{err}</p> : null}
            {authenticated && liveSetup && !liveSetup.builderFee ? (
              <p className="mt-2 text-xs text-[var(--text-2)]">
                {interpolate(hip4.wallet.firstOrderFeeHint, { rate: sellFeeLabel })}
              </p>
            ) : null}
            {hydrating ? (
              <div className="skel mt-4 h-12 w-full rounded-xl" />
            ) : !authenticated ? (
              <button
                type="button"
                onClick={() => login()}
                className="btn-stamp btn-primary mt-4 w-full py-3 text-sm"
              >
                {hip4.header.signIn}
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  trade.isPending ||
                  (authenticated && !spot.hydrated) ||
                  sizeBlocked ||
                  limitInvalid ||
                  (limit && waitPx == null) ||
                  (action === 'sell' && !canSell)
                }
                onClick={openTicket}
                className={`btn-stamp mt-4 w-full py-3 text-sm ${
                  action === 'buy' ? (side === 0 ? 'btn-yes' : 'btn-no') : 'bg-[var(--danger)] text-white'
                }`}
              >
                {trade.isPending
                  ? '…'
                  : limit
                    ? limitCents != null
                      ? interpolate(hip4.ticket.waitCta, { cents: limitCents })
                      : hip4.ticket.wait
                    : action === 'buy'
                      ? interpolate(hip4.ticket.buyName, { name: selectedName })
                      : closingAll
                        ? interpolate(hip4.ticket.closeAll, { name: selectedName })
                        : interpolate(hip4.ticket.sellName, { name: selectedName })}
              </button>
            )}
            {waitingOrders.map((o) => {
              const name = multiLeg
                ? (siblings.find((m) => m.outcomeId === o.outcomeId)?.legLabel ?? hip4.yes)
                : o.side === 0
                  ? (market.sides[0]?.name ?? hip4.yes)
                  : (market.sides[1]?.name ?? hip4.no);
              return (
                <div key={`${o.oid}:${o.outcomeId}:${o.side}`} className="mt-3 flex items-center justify-between text-xs">
                  <span>
                    {name} · {o.tradeSide} {o.sz.toFixed(2)} @ {(o.limitPx * 100).toFixed(1)}¢
                  </span>
                  <button
                    type="button"
                    className="font-bold text-[var(--danger)]"
                    onClick={() =>
                      void cancelOutcomeOrder({ oid: o.oid, outcomeId: o.outcomeId, side: o.side }).then(
                        () => qc.invalidateQueries({ queryKey: ['hip4', 'open-orders'] }),
                      )
                    }
                  >
                    {hip4.ticket.cancelWait}
                  </button>
                </div>
              );
            })}
            <RedeemButtons market={selectedMarket} siblings={siblings} balances={spot.balances} />
          </>
        )}
      </aside>

      <div className="lg:col-start-1">
        <MarketActivity
          market={selectedMarket}
          prints={stream.prints}
          tapeReady={stream.tapeReady}
          multiLeg={multiLeg}
          legNames={printNames}
          book={bookQ.data}
          bookLoading={bookQ.isLoading}
        />
      </div>

      <OrderTicketModal
        open={!!ticket}
        phase={ticket?.phase ?? 'confirm'}
        payload={liveTicketPayload}
        status={ticket?.status}
        error={ticket?.error}
        busy={trade.isPending}
        livePrice={ticket?.phase === 'confirm' && !trade.isPending && ticket?.orderType !== 'limit'}
        onConfirm={placeReviewed}
        onClose={() => {
          if (!trade.isPending) setTicket(null);
        }}
      />
    </div>
  );
}

function RedeemButtons({
  market,
  siblings,
  balances,
}: {
  market: ListedMarket;
  siblings: ListedMarket[];
  balances: Array<Record<string, unknown>>;
}) {
  const { hip4 } = useCopy();
  const qc = useQueryClient();
  if (siblings.length > 1) {
    const n = questionRedeemShares(
      balances,
      siblings.map((s) => s.outcomeId),
    );
    if (!(n > 0) || market.questionId == null) return null;
    return (
      <button
        type="button"
        className="mt-4 w-full rounded-xl border border-[var(--border)] py-2 text-xs font-bold"
        onClick={() =>
          void redeemQuestionBundle(market.questionId!).then(() => qc.invalidateQueries({ queryKey: ['hip4'] }))
        }
      >
        {interpolate(hip4.ticket.cashOutSet, { amount: n.toFixed(2) })}
      </button>
    );
  }
  const n = pairedRedeemShares(balances, market.outcomeId);
  if (!(n > 0)) return null;
  return (
    <button
      type="button"
      className="mt-4 w-full rounded-xl border border-[var(--border)] py-2 text-xs font-bold"
      onClick={() =>
        void redeemOutcomePair(market.outcomeId).then(() => qc.invalidateQueries({ queryKey: ['hip4'] }))
      }
    >
      {interpolate(hip4.ticket.cashOutPair, { amount: n.toFixed(2) })}
    </button>
  );
}
