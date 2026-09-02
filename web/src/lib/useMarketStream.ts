import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchOutcomeRecentTrades,
  isOutcomeRailPx,
  outcomeSpotCoin,
  parseOutcomeTrade,
  parseSideCoin,
  type OutcomePrint,
  type OutcomeSide,
} from '@hip4';
import { hlWsUrl } from '@hip4/endpoints';
import { IS_TESTNET } from './config';

const TAPE_CAP = 80;
const TAPE_POLL_MS = 8_000;
const PING_MS = 30_000;
const UI_FLUSH_MS = 180;

export type StreamLeg = {
  key: string;
  outcomeId: number;
  side: OutcomeSide;
  seed: number | null;
};

function clampPx(n: number): number {
  return Math.min(0.9999, Math.max(0.0001, n));
}

export function useMarketStream(legs: StreamLeg[], enabled = true) {
  const legsKey = legs.map((l) => `${l.outcomeId}:${l.side}`).join(',');
  const [connected, setConnected] = useState(false);
  const [midsByKey, setMidsByKey] = useState<Record<string, number | null>>({});
  const [bboByKey, setBboByKey] = useState<Record<string, { bid: number | null; ask: number | null }>>(
    {},
  );
  const [prints, setPrints] = useState<OutcomePrint[]>([]);
  const [tapeReady, setTapeReady] = useState(false);
  const midsRef = useRef<Record<string, number | null>>({});
  const bboRef = useRef<Record<string, { bid: number | null; ask: number | null }>>({});
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const outcomeIds = useMemo(() => {
    const ids = new Set<number>();
    for (const l of legs) ids.add(l.outcomeId);
    return [...ids];
  }, [legsKey]);

  const flush = useCallback(() => {
    setMidsByKey({ ...midsRef.current });
    setBboByKey({ ...bboRef.current });
  }, []);

  const schedule = useCallback(() => {
    if (flushRef.current) return;
    flushRef.current = setTimeout(() => {
      flushRef.current = null;
      flush();
    }, UI_FLUSH_MS);
  }, [flush]);

  useEffect(() => {
    const seeded: Record<string, number | null> = {};
    for (const leg of legs) {
      if (leg.seed != null && Number.isFinite(leg.seed) && !isOutcomeRailPx(leg.seed)) {
        seeded[leg.key] = leg.seed;
      }
    }
    midsRef.current = seeded;
    setMidsByKey({ ...seeded });
    setPrints([]);
    setTapeReady(false);
    if (!outcomeIds.length) {
      setTapeReady(true);
      return;
    }
    let cancelled = false;
    void Promise.all(outcomeIds.map((id) => fetchOutcomeRecentTrades(id)))
      .then((batches) => {
        if (cancelled) return;
        setPrints(batches.flat().sort((a, b) => b.time - a.time).slice(0, TAPE_CAP));
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
    if (!enabled || !outcomeIds.length) return;
    if (document.hidden) return;

    let closed = false;
    let ping: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(hlWsUrl(IS_TESTNET));
      ws.onopen = () => {
        setConnected(true);
        const coins = outcomeIds.flatMap((id) => [outcomeSpotCoin(id, 0), outcomeSpotCoin(id, 1)]);
        for (const coin of coins) {
          ws?.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'trades', coin } }));
          ws?.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'bbo', coin } }));
        }
        ping = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ method: 'ping' }));
        }, PING_MS);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg?.method === 'pong') return;
          const channel = msg?.channel;
          const data = msg?.data;
          if (channel === 'bbo') {
            const parsed = parseSideCoin(String(data?.coin ?? ''));
            if (!parsed) return;
            const bidN = Number(data?.bbo?.[0]?.px);
            const askN = Number(data?.bbo?.[1]?.px);
            const bid = Number.isFinite(bidN) && bidN > 0 && bidN < 1.5 ? bidN : null;
            const ask = Number.isFinite(askN) && askN > 0 && askN < 1.5 ? askN : null;
            const key = `${parsed.outcomeId}:${parsed.side}`;
            bboRef.current = { ...bboRef.current, [key]: { bid, ask } };
            if (bid != null && ask != null) {
              const mid = (bid + ask) / 2;
              if (Number.isFinite(mid) && !isOutcomeRailPx(mid)) {
                midsRef.current = { ...midsRef.current, [key]: mid };
                const other: OutcomeSide = parsed.side === 0 ? 1 : 0;
                const k2 = `${parsed.outcomeId}:${other}`;
                midsRef.current[k2] = clampPx(1 - mid);
              }
            }
            schedule();
          }
          if (channel === 'trades') {
            const rows = Array.isArray(data) ? data : data ? [data] : [];
            const parsed = rows
              .map((row) => parseOutcomeTrade(row))
              .filter((p): p is OutcomePrint => p != null);
            if (parsed.length) {
              setPrints((prev) => {
                const byId = new Map(prev.map((p) => [p.id, p]));
                for (const p of parsed) byId.set(p.id, p);
                return [...byId.values()].sort((a, b) => b.time - a.time).slice(0, TAPE_CAP);
              });
            }
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (ping) clearInterval(ping);
        if (!closed) retry = setTimeout(connect, 1600);
      };
    };

    connect();
    const onVis = () => {
      if (document.hidden) {
        closed = true;
        ws?.close();
        setConnected(false);
      } else {
        closed = false;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      closed = true;
      document.removeEventListener('visibilitychange', onVis);
      if (ping) clearInterval(ping);
      if (retry) clearTimeout(retry);
      if (flushRef.current) clearTimeout(flushRef.current);
      ws?.close();
    };
  }, [enabled, legsKey, outcomeIds, schedule]);

  useEffect(() => {
    if (!enabled || !outcomeIds.length) return;
    let cancelled = false;
    const pull = () => {
      void Promise.all(outcomeIds.map((id) => fetchOutcomeRecentTrades(id)))
        .then((batches) => {
          if (cancelled) return;
          const incoming = batches.flat();
          if (!incoming.length) return;
          setPrints((prev) => {
            const byId = new Map(prev.map((p) => [p.id, p]));
            for (const p of incoming) byId.set(p.id, p);
            return [...byId.values()].sort((a, b) => b.time - a.time).slice(0, TAPE_CAP);
          });
        })
        .catch(() => undefined);
    };
    const timer = setInterval(pull, TAPE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, legsKey, outcomeIds]);

  return { connected, midsByKey, bboByKey, prints, tapeReady };
}
