import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getSpotClearinghouseState } from './hyperliquid';
import { getHlWsUrl, onTradingEnvChange } from './hlEnv';

const WS_CONNECTING_TIMEOUT_MS = 15_000;
const REST_FALLBACK_AFTER_MS = 8_000;
const MIN_REST_HYDRATE_INTERVAL_MS = 4_000;
/** Must sit above the 30s ping so a quiet HIP-4 book doesn't look dead. */
const STALE_ACCOUNT_MESSAGE_MS = 55_000;
const STALENESS_CHECK_INTERVAL_MS = 10_000;

type Hex = `0x${string}`;

type StreamState = {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  /** Unused in HIP-4 (perp leftover). Kept so Profile/DepositPanel don't crash. */
  webData3?: any;
  clearinghouseState?: any;
  clearinghouseStatesByDex?: Record<string, any>;
  openOrders?: any;
  spotState?: any;
};

/**
 * Owns the account WebSocket. HIP-4 only: spot balances (`+encoding` / USDC).
 * Do not subscribe to perp `webData3`, `allDexsClearinghouseState`, or HIP-3
 * `openOrders` — those dumps freeze the ticket (Yes/No taps wait on JSON.parse).
 */
const EMPTY_STREAM_STATE: StreamState = {
  isConnected: false,
  connectionStatus: 'disconnected',
  webData3: undefined,
  clearinghouseState: undefined,
  clearinghouseStatesByDex: undefined,
  openOrders: undefined,
  spotState: undefined,
};

function sameHex(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

function sameSpotBalances(a: any, b: any): boolean {
  const ab = a?.balances;
  const bb = b?.balances;
  if (ab === bb) return true;
  if (!Array.isArray(ab) || !Array.isArray(bb) || ab.length !== bb.length) return false;
  for (let i = 0; i < ab.length; i++) {
    if (String(ab[i]?.coin ?? '') !== String(bb[i]?.coin ?? '')) return false;
    if (String(ab[i]?.total ?? '') !== String(bb[i]?.total ?? '')) return false;
    if (String(ab[i]?.hold ?? '') !== String(bb[i]?.hold ?? '')) return false;
  }
  return true;
}

export function useHyperliquidAccountStreamController(user?: Hex) {
  const [state, setState] = useState<StreamState>({
    isConnected: false,
    connectionStatus: 'disconnected',
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const retryCount = useRef(0);
  const connectingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRestHydrateAt = useRef(0);
  const lastMessageAt = useRef<number>(0);
  const lastWsAccountUpdateAt = useRef<number>(0);
  const stalenessIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const hydrateEpochRef = useRef(0);
  const [trackedUser, setTrackedUser] = useState(user);

  if (user !== trackedUser) {
    setTrackedUser(user);
    hydrateEpochRef.current += 1;
    lastWsAccountUpdateAt.current = 0;
    setState({
      ...EMPTY_STREAM_STATE,
      connectionStatus: user ? 'connecting' : 'disconnected',
    });
  }

  const clearConnectingWatchdog = useCallback(() => {
    if (connectingWatchdogRef.current) {
      clearTimeout(connectingWatchdogRef.current);
      connectingWatchdogRef.current = null;
    }
  }, []);

  const clearRestFallbackTimer = useCallback(() => {
    if (restFallbackTimerRef.current) {
      clearTimeout(restFallbackTimerRef.current);
      restFallbackTimerRef.current = null;
    }
  }, []);

  const stopStalenessWatchdog = useCallback(() => {
    if (stalenessIntervalRef.current) {
      clearInterval(stalenessIntervalRef.current);
      stalenessIntervalRef.current = null;
    }
  }, []);

  const hydrateFromRest = useCallback(async (force = false) => {
    if (!user) return;
    const now = Date.now();
    if (!force && now - lastRestHydrateAt.current < MIN_REST_HYDRATE_INTERVAL_MS) return;
    lastRestHydrateAt.current = now;
    const requestStartedAt = now;
    const epoch = hydrateEpochRef.current;
    const addr = user;
    try {
      const spotCh = await getSpotClearinghouseState(addr).catch(() => null);
      if (hydrateEpochRef.current !== epoch || !sameHex(userRef.current, addr)) return;
      if (lastWsAccountUpdateAt.current > requestStartedAt) return;
      if (spotCh == null) return;
      setState((s) => (sameSpotBalances(s.spotState, spotCh) ? s : { ...s, spotState: spotCh }));
    } catch {
      /* WS may still recover */
    }
  }, [user]);

  const sendSubscribe = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !user) return;
    ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'spotState', user } }));
  }, [user]);

  const disconnect = useCallback(() => {
    clearConnectingWatchdog();
    stopStalenessWatchdog();
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
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
    setState((s) => ({ ...s, isConnected: false, connectionStatus: 'disconnected' }));
  }, [clearConnectingWatchdog, stopStalenessWatchdog]);

  const connect = useCallback(() => {
    if (!user) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    clearConnectingWatchdog();
    setState((s) => ({ ...s, connectionStatus: 'connecting' }));
    try {
      const ws = new WebSocket(getHlWsUrl());
      wsRef.current = ws;

      connectingWatchdogRef.current = setTimeout(() => {
        connectingWatchdogRef.current = null;
        if (wsRef.current !== ws) return;
        if (ws.readyState === WebSocket.CONNECTING) {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        }
      }, WS_CONNECTING_TIMEOUT_MS);

      ws.onopen = () => {
        clearConnectingWatchdog();
        retryCount.current = 0;
        lastMessageAt.current = Date.now();
        setState((s) => ({ ...s, isConnected: true, connectionStatus: 'connected' }));
        setTimeout(sendSubscribe, 50);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ method: 'ping' }));
          }
        }, 30_000);

        stopStalenessWatchdog();
        stalenessIntervalRef.current = setInterval(() => {
          if (appState.current !== 'active') return;
          if (wsRef.current !== ws) return;
          if (ws.readyState !== WebSocket.OPEN) return;
          if (Date.now() - lastMessageAt.current > STALE_ACCOUNT_MESSAGE_MS) {
            void hydrateFromRest(true);
            try {
              ws.close();
            } catch {
              /* ignore */
            }
          }
        }, STALENESS_CHECK_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        lastMessageAt.current = Date.now();
        try {
          const msg = JSON.parse(String(event.data));
          if (msg?.method === 'pong') return;
          const channel = msg?.channel;
          if (channel !== 'spotState') return;
          const data = msg?.data;
          const frameUser = typeof data?.user === 'string' ? data.user : null;
          if (frameUser && userRef.current && !sameHex(frameUser, userRef.current)) return;
          lastWsAccountUpdateAt.current = Date.now();
          const next = data?.spotState ?? data;
          setState((s) => (sameSpotBalances(s.spotState, next) ? s : { ...s, spotState: next }));
        } catch {
          /* ignore */
        }
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        setState((s) => ({ ...s, connectionStatus: 'error' }));
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        clearConnectingWatchdog();
        clearRestFallbackTimer();
        stopStalenessWatchdog();
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        setState((s) => ({ ...s, isConnected: false, connectionStatus: 'disconnected' }));
        wsRef.current = null;
        if (appState.current === 'active') {
          retryCount.current += 1;
          const delay = Math.min(1000 * Math.pow(2, retryCount.current - 1), 30_000);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };
    } catch {
      setState((s) => ({ ...s, connectionStatus: 'error' }));
    }
  }, [clearConnectingWatchdog, clearRestFallbackTimer, sendSubscribe, stopStalenessWatchdog, hydrateFromRest, user]);

  const reconnect = useCallback(() => {
    if (!user) return;
    disconnect();
    retryCount.current = 0;
    hydrateEpochRef.current += 1;
    setState({
      ...EMPTY_STREAM_STATE,
      connectionStatus: 'connecting',
    });
    void hydrateFromRest(true);
    setTimeout(() => connect(), 0);
  }, [user, connect, disconnect, hydrateFromRest]);

  useEffect(() => {
    retryCount.current = 0;
    disconnect();
    if (!user) return undefined;
    const t = setTimeout(() => connect(), 0);
    return () => {
      clearTimeout(t);
      disconnect();
    };
  }, [user, connect, disconnect]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        retryCount.current = 0;
        connect();
      } else if (next.match(/inactive|background/)) {
        disconnect();
      }
    });
    return () => sub.remove();
  }, [connect, disconnect]);

  useEffect(() => {
    const unsub = onTradingEnvChange(() => {
      reconnect();
    });
    return unsub;
  }, [reconnect]);

  useEffect(() => {
    clearRestFallbackTimer();
    if (!user || state.spotState) return undefined;
    restFallbackTimerRef.current = setTimeout(() => {
      restFallbackTimerRef.current = null;
      void hydrateFromRest();
    }, REST_FALLBACK_AFTER_MS);
    return () => clearRestFallbackTimer();
  }, [user, state.spotState, hydrateFromRest, clearRestFallbackTimer]);

  return useMemo(
    () => ({
      ...state,
      subscribedUser: user ?? null,
      agentAddress: null as string | null,
      agentValidUntil: null as number | null,
      reconnect,
      hydrateFromRest,
    }),
    [hydrateFromRest, reconnect, state, user],
  );
}

export type HyperliquidAccountStream = ReturnType<typeof useHyperliquidAccountStreamController>;

export const HyperliquidAccountStreamContext = createContext<HyperliquidAccountStream | null>(null);

/** Spot balances only — perp frames must not re-render the ticket. */
export const HyperliquidSpotStateContext = createContext<unknown>(null);

export function useHyperliquidAccountStream(_user?: Hex): HyperliquidAccountStream {
  const ctx = useContext(HyperliquidAccountStreamContext);
  if (!ctx) {
    throw new Error(
      'useHyperliquidAccountStream must be used within HyperliquidAccountStreamProvider',
    );
  }
  return ctx;
}

export function useHyperliquidSpotState(): { balances?: unknown } | null {
  return useContext(HyperliquidSpotStateContext) as { balances?: unknown } | null;
}
