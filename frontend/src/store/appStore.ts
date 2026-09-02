import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MAIN_TRADING_BOOK,
  type ActiveTradingBook,
} from '../lib/tradingBook';
import { setHomeHeroAuthedHint } from '../lib/homeHeroAuthHint';

export type TradingEnv = 'mainnet' | 'demo';
export type { ActiveTradingBook };

const TRADING_ENV_STORAGE_KEY = 'orbcast_trading_env_v1';
const ACTIVE_BOOK_STORAGE_KEY = 'orbcast_active_trading_book_v1';

// Read once at module load so synchronous getters (used by HL transport, EIP-712
// signing, etc.) can return the right env immediately on app boot. Without this,
// the SDK would briefly default to mainnet during the async hydration window
// even for users who last had demo mode active.
let _hydratedEnv: TradingEnv = 'mainnet';
let _hydrated = false;

interface AppState {
  // Auth state
  isAuthenticated: boolean;
  isGuest: boolean;
  user: any | null;

  // UI state
  isLoading: boolean;
  error: string | null;

  // Trading environment — switches the entire HL stack between
  // mainnet and testnet (demo). Persisted in AsyncStorage so it
  // survives app restarts.
  tradingEnv: TradingEnv;

  /**
   * Active trading book (Main vs Dedicated sub). Drives Home/Portfolio
   * switchers and order routing (vaultAddress) on trade surfaces.
   */
  activeTradingBook: ActiveTradingBook;

  // Actions
  setAuthenticated: (isAuth: boolean, user?: any) => void;
  setGuest: (isGuest: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setTradingEnv: (env: TradingEnv) => void;
  setActiveTradingBook: (book: ActiveTradingBook) => void;
  clearActiveTradingBook: () => void;
  logout: () => void;
}

function persistActiveBook(book: ActiveTradingBook) {
  AsyncStorage.setItem(ACTIVE_BOOK_STORAGE_KEY, JSON.stringify(book)).catch(() => {});
}

function normalizeActiveBook(raw: unknown): ActiveTradingBook {
  if (!raw || typeof raw !== 'object') return MAIN_TRADING_BOOK;
  const o = raw as Record<string, unknown>;
  const agentId = typeof o.agentId === 'string' && o.agentId ? o.agentId : null;
  const sub = typeof o.subAddress === 'string' && o.subAddress.startsWith('0x')
    ? (o.subAddress as ActiveTradingBook['subAddress'])
    : null;
  const name = typeof o.name === 'string' && o.name ? o.name : null;
  if (!agentId || !sub) return MAIN_TRADING_BOOK;
  return { agentId, subAddress: sub, name };
}

export const useAppStore = create<AppState>((set) => ({
  isAuthenticated: false,
  isGuest: true,
  user: null,
  isLoading: false,
  error: null,
  tradingEnv: _hydratedEnv,
  activeTradingBook: MAIN_TRADING_BOOK,

  setAuthenticated: (isAuth, user = null) => {
    setHomeHeroAuthedHint(isAuth);
    set({
      isAuthenticated: isAuth,
      isGuest: !isAuth,
      user,
    });
  },

  setGuest: (isGuest) => set({ isGuest }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  setTradingEnv: (env) => {
    if (env !== 'mainnet' && env !== 'demo') return;
    _hydratedEnv = env;
    // Books are env-scoped (demo subs ≠ mainnet); reset to Main on flip.
    set({ tradingEnv: env, activeTradingBook: MAIN_TRADING_BOOK });
    // Fire-and-forget persist; storage failures shouldn't block the UI flip.
    AsyncStorage.setItem(TRADING_ENV_STORAGE_KEY, env).catch(() => { /* noop */ });
    persistActiveBook(MAIN_TRADING_BOOK);
    // Notify any non-React subscribers (HL transport singletons, WS provider)
    // so they can rebuild their connections against the new endpoint.
    _notifyEnvChange(env);
  },

  setActiveTradingBook: (book) => {
    const next = normalizeActiveBook(book);
    set({ activeTradingBook: next });
    persistActiveBook(next);
  },

  clearActiveTradingBook: () => {
    set({ activeTradingBook: MAIN_TRADING_BOOK });
    persistActiveBook(MAIN_TRADING_BOOK);
  },

  logout: () => {
    // Always drop back to mainnet on logout. Demo mode is identity/session
    // scoped, so a different user on the same device must not inherit testnet
    // transports or cached UI state from the previous account.
    _hydratedEnv = 'mainnet';
    setHomeHeroAuthedHint(false);
    set({
      isAuthenticated: false,
      isGuest: true,
      user: null,
      tradingEnv: 'mainnet',
      activeTradingBook: MAIN_TRADING_BOOK,
    });
    AsyncStorage.setItem(TRADING_ENV_STORAGE_KEY, 'mainnet').catch(() => { /* noop */ });
    persistActiveBook(MAIN_TRADING_BOOK);
    _notifyEnvChange('mainnet');
  },
}));

// ---------------------------------------------------------------------------
// Env-change subscription — non-React listeners (HL transport singletons, the
// WebSocket provider) need to react to mode flips. We expose a tiny pub/sub
// so they can subscribe without depending on React lifecycle.
// ---------------------------------------------------------------------------

type EnvListener = (env: TradingEnv) => void;
const _envListeners = new Set<EnvListener>();

function _notifyEnvChange(env: TradingEnv) {
  _envListeners.forEach((cb) => {
    try { cb(env); } catch { /* listener errors must not break the state set */ }
  });
}

export function subscribeTradingEnv(listener: EnvListener): () => void {
  _envListeners.add(listener);
  return () => { _envListeners.delete(listener); };
}

export function getTradingEnvSync(): TradingEnv {
  return _hydratedEnv;
}

// ---------------------------------------------------------------------------
// Boot-time hydration. Called once from the root layout before any HL code
// runs. Idempotent — repeat calls are a no-op.
// ---------------------------------------------------------------------------

export async function hydrateTradingEnv(): Promise<TradingEnv> {
  if (_hydrated) return _hydratedEnv;
  _hydrated = true;
  try {
    const stored = await AsyncStorage.getItem(TRADING_ENV_STORAGE_KEY);
    if (stored === 'demo' || stored === 'mainnet') {
      _hydratedEnv = stored;
      // Push into the store without writing back to storage (we just read it).
      useAppStore.setState({ tradingEnv: stored });
      _notifyEnvChange(stored);
    }
  } catch {
    // Storage failure → fall back to default mainnet, no-op.
  }
  return _hydratedEnv;
}

let _bookHydrated = false;

/** Restore last active trading book (Main vs Dedicated sub). Idempotent. */
export async function hydrateActiveTradingBook(): Promise<ActiveTradingBook> {
  if (_bookHydrated) return useAppStore.getState().activeTradingBook;
  _bookHydrated = true;
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_BOOK_STORAGE_KEY);
    if (!raw) return MAIN_TRADING_BOOK;
    const book = normalizeActiveBook(JSON.parse(raw));
    useAppStore.setState({ activeTradingBook: book });
    return book;
  } catch {
    return MAIN_TRADING_BOOK;
  }
}
