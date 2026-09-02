import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getHlWsUrl, onTradingEnvChange } from './hlEnv';
import {
  fetchOutcomeRecentTrades,
  isOutcomeRailPx,
  outcomeSpotCoin,
  parseOutcomeTrade,
  parseSideCoin,
  type OutcomePrint,
  type OutcomeSide,
} from './hip4';

const TAPE_CAP = 80;
const TAPE_POLL_MS = 8_000;
const PING_MS = 30_000;
const CONNECT_TIMEOUT_MS = 15_000;
const RECONNECT_BASE_MS = 1_200;
/** Ignore 1¢/99¢ (or a missing side) until it repeats — one-frame BBO flicker. */
const QUOTE_HOLD_FRAMES = 4;
/** Two-sided BBO wins over a one-tick print mid for this long. */
const BBO_MID_TTL_MS = 6_000;
/** Batch pill/quote React updates so a busy book doesn't freeze the ticket. */
const UI_FLUSH_MS = 180;

export type StreamLeg = {
  key: string;
  outcomeId: number;
  side: OutcomeSide;
  seed: number | null;
};

function clampOutcomePx(n: number): number {
  return Math.min(0.9999, Math.max(0.0001, n));
}

type HeldQuote = {
  bid: number | null;
  ask: number | null;
  bidHold: number;
  askHold: number;
};

function holdLevel(
  prev: number | null,
  next: number | null,
  hold: number,
): { px: number | null; hold: number } {
  if (next == null) {
    const n = hold + 1;
    if (n >= QUOTE_HOLD_FRAMES) return { px: null, hold: n };
    return { px: prev, hold: n };
  }
  if (isOutcomeRailPx(next) && (prev == null || !isOutcomeRailPx(prev))) {
    const n = hold + 1;
    if (n >= QUOTE_HOLD_FRAMES) return { px: next, hold: 0 };
    return { px: prev, hold: n };
  }
  return { px: next, hold: 0 };
}

function mergePrints(prev: OutcomePrint[], incoming: OutcomePrint[]): OutcomePrint[] {
  if (!incoming.length) return prev;
  const byId = new Map(prev.map((p) => [p.id, p]));
  for (const p of incoming) byId.set(p.id, p);
  return [...byId.values()].sort((a, b) => b.time - a.time).slice(0, TAPE_CAP);
}

export function useOutcomeMarketStream(
  legs: StreamLeg[],
  opts?: { onLivePrints?: (prints: OutcomePrint[]) => void; enabled?: boolean },
) {
  const enabled = opts?.enabled !== false;
  const legsKey = legs.map((l) => `${l.outcomeId}:${l.side}`).join(',');
  const [connected, setConnected] = useState(false);
  const [midsByKey, setMidsByKey] = useState<Record<string, number | null>>({});
  const [bboByKey, setBboByKey] = useState<Record<string, { bid: number | null; ask: number | null }>>(
    {},
  );
  const [prints, setPrints] = useState<OutcomePrint[]>([]);
  const [tapeReady, setTapeReady] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectWatchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef(0);
  const legsRef = useRef(legs);
  legsRef.current = legs;
  const midsRef = useRef<Record<string, number | null>>({});
  const bboHoldRef = useRef<Record<string, HeldQuote>>({});
  const bboFreshAtRef = useRef<Record<string, number>>({});
  const bboUiRef = useRef<Record<string, { bid: number | null; ask: number | null }>>({});
  const printsRef = useRef<OutcomePrint[]>([]);
  const pendingPrintsRef = useRef<OutcomePrint[] | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFlushAtRef = useRef(0);
  const scheduleUiRef = useRef<() => void>(() => {});
  const livePrintsRef = useRef(opts?.onLivePrints);
  livePrintsRef.current = opts?.onLivePrints;
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const outcomeIds = useMemo(() => {
    const ids = new Set<number>();
    if (!legsKey) return [] as number[];
    for (const part of legsKey.split(',')) {
      const id = Number(part.split(':')[0]);
      if (Number.isFinite(id)) ids.add(id);
    }
    return [...ids];
  }, [legsKey]);

  const commitMids = useCallback((patch: Record<string, number | null>) => {
    const merged = { ...midsRef.current };
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || !Number.isFinite(v)) continue;
      if (merged[k] !== v) {
        merged[k] = v;
        changed = true;
      }
    }
    if (!changed) return;
    midsRef.current = merged;
    scheduleUiRef.current();
  }, []);

  scheduleUiRef.current = () => {
    const elapsed = Date.now() - lastFlushAtRef.current;
    const flush = () => {
      flushTimerRef.current = null;
      lastFlushAtRef.current = Date.now();
      setMidsByKey({ ...midsRef.current });
      setBboByKey({ ...bboUiRef.current });
      if (pendingPrintsRef.current) {
        printsRef.current = pendingPrintsRef.current;
        pendingPrintsRef.current = null;
        setPrints(printsRef.current);
      }
    };
    if (elapsed >= UI_FLUSH_MS) {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flush();
      return;
    }
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(flush, UI_FLUSH_MS - elapsed);
  };

  const ingestPrints = useCallback(
    (rows: OutcomePrint[], live: boolean) => {
      const ids = new Set(legsRef.current.map((l) => l.outcomeId));
      const keep = rows.filter((p) => p.outcomeId === -1 || ids.has(p.outcomeId));
      if (!keep.length) return;
      if (live) livePrintsRef.current?.(keep);
      pendingPrintsRef.current = mergePrints(pendingPrintsRef.current ?? printsRef.current, keep);
      const last = keep[0];
      const printSide = last.side;
      if (printSide === 0 || printSide === 1) {
        const patch: Record<string, number | null> = {};
        const k = `${last.outcomeId}:${printSide}`;
        if (legsRef.current.some((l) => l.key === k)) {
          const prev = midsRef.current[k];
          if (!(prev != null && isOutcomeRailPx(last.px) && !isOutcomeRailPx(prev))) {
            patch[k] = last.px;
          }
        }
        const other: OutcomeSide = printSide === 0 ? 1 : 0;
        const k2 = `${last.outcomeId}:${other}`;
        if (legsRef.current.some((l) => l.key === k2)) {
          const implied = clampOutcomePx(1 - last.px);
          const prev = midsRef.current[k2];
          const otherHasBbo =
            bboFreshAtRef.current[k2] != null && Date.now() - bboFreshAtRef.current[k2] < BBO_MID_TTL_MS;
          if (!otherHasBbo && !(prev != null && isOutcomeRailPx(implied) && !isOutcomeRailPx(prev))) {
            patch[k2] = implied;
          }
        }
        commitMids(patch);
      }
      scheduleUiRef.current();
    },
    [commitMids],
  );

  useEffect(() => {
    midsRef.current = {};
    bboHoldRef.current = {};
    bboFreshAtRef.current = {};
    bboUiRef.current = {};
    printsRef.current = [];
    pendingPrintsRef.current = null;
    setPrints([]);
    setTapeReady(false);
    const seeded: Record<string, number | null> = {};
    for (const leg of legsRef.current) {
      if (leg.seed != null && Number.isFinite(leg.seed) && !isOutcomeRailPx(leg.seed)) {
        seeded[leg.key] = leg.seed;
      }
    }
    midsRef.current = seeded;
    setMidsByKey({ ...seeded });
    setBboByKey({});
    setConnected(false);
    if (!outcomeIds.length) {
      setTapeReady(true);
      return;
    }
    let cancelled = false;
    void Promise.all(outcomeIds.map((id) => fetchOutcomeRecentTrades(id)))
      .then((batches) => {
        if (cancelled) return;
        const rows = batches.flat().sort((a, b) => b.time - a.time).slice(0, TAPE_CAP);
        printsRef.current = rows;
        pendingPrintsRef.current = null;
        setPrints(rows);
        setTapeReady(true);
      })
      .catch(() => {
        if (!cancelled) setTapeReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [legsKey]);

  useEffect(() => {
    const clearTimers = () => {
      if (pingRef.current) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (connectWatchRef.current) {
        clearTimeout(connectWatchRef.current);
        connectWatchRef.current = null;
      }
    };

    const teardown = () => {
      clearTimers();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
      setConnected(false);
    };

    if (!outcomeIds.length) {
      teardown();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      printsRef.current = [];
      pendingPrintsRef.current = null;
      setPrints([]);
      setTapeReady(true);
      setMidsByKey({});
      setBboByKey({});
      midsRef.current = {};
      bboHoldRef.current = {};
      bboFreshAtRef.current = {};
      bboUiRef.current = {};
      return;
    }

    if (!enabled) {
      teardown();
      return;
    }

    const subscribe = (ws: WebSocket) => {
      const coins = outcomeIds.flatMap((id) => [outcomeSpotCoin(id, 0), outcomeSpotCoin(id, 1)]);
      for (const coin of coins) {
        ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'trades', coin } }));
        ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'bbo', coin } }));
      }
    };

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
        return;
      }
      if (!legsRef.current.length) return;
      const ws = new WebSocket(getHlWsUrl());
      wsRef.current = ws;

      connectWatchRef.current = setTimeout(() => {
        connectWatchRef.current = null;
        if (wsRef.current !== ws) return;
        if (ws.readyState === WebSocket.CONNECTING) {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        }
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        if (connectWatchRef.current) {
          clearTimeout(connectWatchRef.current);
          connectWatchRef.current = null;
        }
        retryRef.current = 0;
        setConnected(true);
        subscribe(ws);
        if (pingRef.current) clearInterval(pingRef.current);
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ method: 'ping' }));
          }
        }, PING_MS);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg?.method === 'pong') return;
          const channel = msg?.channel;
          const data = msg?.data;
          if (!legsRef.current.length) return;

          if (channel === 'allMids' || channel === 'webData3' || channel === 'clearinghouseState') {
            return;
          }

          if (channel === 'bbo') {
            const coin = String(data?.coin ?? '');
            const parsed = parseSideCoin(coin);
            if (!parsed) return;
            if (!legsRef.current.some((l) => l.outcomeId === parsed.outcomeId)) return;
            const bidN = Number(data?.bbo?.[0]?.px);
            const askN = Number(data?.bbo?.[1]?.px);
            const rawBid = Number.isFinite(bidN) && bidN > 0 && bidN < 1.5 ? bidN : null;
            const rawAsk = Number.isFinite(askN) && askN > 0 && askN < 1.5 ? askN : null;
            const key = `${parsed.outcomeId}:${parsed.side}`;
            const held = bboHoldRef.current[key] ?? { bid: null, ask: null, bidHold: 0, askHold: 0 };
            const nextBid = holdLevel(held.bid, rawBid, held.bidHold);
            const nextAsk = holdLevel(held.ask, rawAsk, held.askHold);
            const bid = nextBid.px;
            const ask = nextAsk.px;
            bboHoldRef.current[key] = {
              bid,
              ask,
              bidHold: nextBid.hold,
              askHold: nextAsk.hold,
            };
            const prevUi = bboUiRef.current[key];
            if (prevUi?.bid !== bid || prevUi?.ask !== ask) {
              bboUiRef.current = { ...bboUiRef.current, [key]: { bid, ask } };
              scheduleUiRef.current();
            }
            if (bid == null || ask == null) return;
            const mid = (bid + ask) / 2;
            if (!Number.isFinite(mid) || isOutcomeRailPx(mid)) return;
            bboFreshAtRef.current[key] = Date.now();
            const patch: Record<string, number | null> = { [key]: mid };
            const other: OutcomeSide = parsed.side === 0 ? 1 : 0;
            const k2 = `${parsed.outcomeId}:${other}`;
            if (legsRef.current.some((l) => l.key === k2)) {
              const implied = clampOutcomePx(1 - mid);
              const otherBboAt = bboFreshAtRef.current[k2];
              const otherFresh = otherBboAt != null && Date.now() - otherBboAt < BBO_MID_TTL_MS;
              if (!otherFresh && !isOutcomeRailPx(implied)) patch[k2] = implied;
            }
            commitMids(patch);
            return;
          }

          if (channel === 'trades') {
            const rows = Array.isArray(data) ? data : data ? [data] : [];
            const parsed = rows
              .map((row) => parseOutcomeTrade(row))
              .filter((p): p is OutcomePrint => p != null);
            ingestPrints(parsed, true);
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        setConnected(false);
        clearTimers();
        if (!legsRef.current.length) return;
        const delay = Math.min(12_000, RECONNECT_BASE_MS * Math.pow(1.7, retryRef.current));
        retryRef.current += 1;
        reconnectRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    };

    connect();

    const appSub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        retryRef.current = 0;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) connect();
      }
    });
    const unsubEnv = onTradingEnvChange(() => {
      teardown();
      retryRef.current = 0;
      connect();
    });

    return () => {
      appSub.remove();
      unsubEnv();
      teardown();
    };
  }, [legsKey, enabled, ingestPrints, commitMids]);

  useEffect(() => {
    if (!enabled || !outcomeIds.length) return;
    let cancelled = false;
    const pull = () => {
      void Promise.all(outcomeIds.map((id) => fetchOutcomeRecentTrades(id)))
        .then((batches) => {
          if (!cancelled) ingestPrints(batches.flat(), false);
        })
        .catch(() => undefined);
    };
    const timer = setInterval(pull, TAPE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, legsKey, outcomeIds, ingestPrints]);

  return {
    connected,
    midsByKey,
    bboByKey,
    prints,
    tapeReady,
  };
}
