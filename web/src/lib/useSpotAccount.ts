import { useEffect, useRef, useState } from 'react';
import { type Hex } from '@hip4';
import { hlWsUrl } from '@hip4/endpoints';
import { IS_TESTNET } from './config';
import { fetchHlUsdBalances, hlUsdFromSpotRows, type HlUsdBalances } from './webKernel';

const EMPTY: Pick<HlUsdBalances, 'trade' | 'transferable' | 'spendable' | 'spot' | 'perp' | 'unified'> = {
  trade: 0,
  transferable: 0,
  spendable: 0,
  spot: 0,
  perp: 0,
  unified: false,
};

export function useSpotAccount(address: Hex | null, enabled = true) {
  const [balances, setBalances] = useState<Array<Record<string, unknown>>>([]);
  const [ledger, setLedger] = useState(EMPTY);
  const [connected, setConnected] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const costByCoin = useRef<Map<string, number>>(new Map());
  const perpRef = useRef(0);
  const unifiedRef = useRef(false);

  useEffect(() => {
    if (!address || !enabled) {
      setBalances([]);
      setLedger(EMPTY);
      perpRef.current = 0;
      unifiedRef.current = false;
      costByCoin.current = new Map();
      setHydrated(false);
      return;
    }
    let cancelled = false;
    const fillCosts = (rows: Array<Record<string, unknown>>) =>
      rows.map((row) => {
        const coin = String(row.coin ?? row.token ?? '');
        const ntl = Number(row.entryNtl);
        if (coin && Number.isFinite(ntl) && ntl > 0) {
          costByCoin.current.set(coin, ntl);
          return row;
        }
        const fallback = costByCoin.current.get(coin);
        return fallback != null ? { ...row, entryNtl: fallback } : row;
      });
    const applyRest = (bals: HlUsdBalances) => {
      perpRef.current = bals.perp;
      unifiedRef.current = bals.unified;
      const rows = fillCosts(bals.balances);
      const next = hlUsdFromSpotRows(rows, bals.perp, bals.unified);
      setBalances(next.balances);
      setLedger({
        trade: next.trade,
        transferable: next.transferable,
        spendable: next.spendable,
        spot: next.spot,
        perp: next.perp,
        unified: next.unified,
      });
    };
    const hydrate = () => {
      void fetchHlUsdBalances(address)
        .then((bals) => {
          if (cancelled) return;
          applyRest(bals);
          setHydrated(true);
        })
        .catch(() => {
          if (!cancelled) setHydrated(true);
        });
    };
    hydrate();
    const poll = setInterval(hydrate, 12_000);

    let ws: WebSocket | null = null;
    const connect = () => {
      ws = new WebSocket(hlWsUrl(IS_TESTNET));
      ws.onopen = () => {
        setConnected(true);
        ws?.send(
          JSON.stringify({ method: 'subscribe', subscription: { type: 'spotState', user: address } }),
        );
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg?.channel !== 'spotState') return;
          const rows = fillCosts(Array.isArray(msg?.data?.balances) ? msg.data.balances : []);
          if (!rows.length && !Array.isArray(msg?.data?.balances)) return;
          const next = hlUsdFromSpotRows(rows, perpRef.current, unifiedRef.current);
          setBalances(next.balances);
          setLedger({
            trade: next.trade,
            transferable: next.transferable,
            spendable: next.spendable,
            spot: next.spot,
            perp: next.perp,
            unified: next.unified,
          });
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      cancelled = true;
      clearInterval(poll);
      ws?.close();
    };
  }, [address, enabled]);

  return {
    balances,
    /** Expo Trade Balance — unified pool, not spot+perp. */
    usdc: ledger.trade,
    transferable: ledger.transferable,
    spendable: ledger.spendable,
    spotUsdc: ledger.spendable,
    perpUsdc: ledger.perp,
    unified: ledger.unified,
    connected,
    hydrated,
  };
}
