import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { fetchForexRates } from '../lib/api';

const CURRENCY_KEY = 'orbcast_display_currency';

/**
 * Builders: set true to surface local-currency display (Profile row, home header,
 * ≈ hints, catalog/positions conversion). Off in this template — prediction
 * sizes stay exact USDC.
 */
export const SHOW_DISPLAY_CURRENCY_UI = false;

export type CurrencyCode =
  | 'USD'
  | 'AED'
  | 'ARS'
  | 'AUD'
  | 'BDT'
  | 'BRL'
  | 'CAD'
  | 'CHF'
  | 'CNH'
  | 'EGP'
  | 'EUR'
  | 'HKD'
  | 'IDR'
  | 'INR'
  | 'JPY'
  | 'KRW'
  | 'NGN'
  | 'PHP'
  | 'RUB'
  | 'SAR'
  | 'SGD'
  | 'TRY';

export interface CurrencyMeta {
  code: CurrencyCode;
  symbol: string;
  name: string;
  flag: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸', decimals: 2 },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', flag: '🇦🇪', decimals: 2 },
  { code: 'ARS', symbol: '₱', name: 'Argentine Peso', flag: '🇦🇷', decimals: 2 },
  { code: 'AUD', symbol: '$', name: 'Australian Dollar', flag: '🇦🇺', decimals: 2 },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', flag: '🇧🇩', decimals: 2 },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', flag: '🇧🇷', decimals: 2 },
  { code: 'CAD', symbol: '$', name: 'Canadian Dollar', flag: '🇨🇦', decimals: 2 },
  { code: 'CHF', symbol: '₣', name: 'Swiss Franc', flag: '🇨🇭', decimals: 2 },
  { code: 'CNH', symbol: '¥', name: 'Chinese Yuan', flag: '🇨🇳', decimals: 2 },
  { code: 'EGP', symbol: '£', name: 'Egyptian Pound', flag: '🇪🇬', decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺', decimals: 2 },
  { code: 'HKD', symbol: '$', name: 'Hong Kong Dollar', flag: '🇭🇰', decimals: 2 },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', flag: '🇮🇩', decimals: 0 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳', decimals: 2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵', decimals: 0 },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', flag: '🇰🇷', decimals: 0 },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', flag: '🇳🇬', decimals: 2 },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', flag: '🇵🇭', decimals: 2 },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble', flag: '🇷🇺', decimals: 2 },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', flag: '🇸🇦', decimals: 2 },
  { code: 'SGD', symbol: '$', name: 'Singapore Dollar', flag: '🇸🇬', decimals: 2 },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', flag: '🇹🇷', decimals: 2 },
];

const CURRENCY_MAP = new Map(SUPPORTED_CURRENCIES.map((c) => [c.code, c]));

/** Legacy display codes migrated on read (CNY → CNH to match UR bank ledger). */
const LEGACY_CURRENCY_ALIASES: Record<string, CurrencyCode> = { CNY: 'CNH' };

function normalizeStoredCurrency(saved: string | null): CurrencyCode | null {
  if (!saved) return null;
  const code = (LEGACY_CURRENCY_ALIASES[saved] ?? saved) as CurrencyCode;
  return CURRENCY_MAP.has(code) ? code : null;
}

/** Stale forex cache may still carry CNY until the backend refreshes — treat as CNH. */
function normalizeForexRates(raw: Record<string, number> | null | undefined): Record<string, number> | null {
  if (!raw) return null;
  if (raw.CNH == null && raw.CNY != null) {
    return { ...raw, CNH: raw.CNY };
  }
  return raw;
}

interface CurrencyContextValue {
  currency: CurrencyCode;
  meta: CurrencyMeta;
  rates: Record<string, number> | null;
  isConverted: boolean;
  isDisplayCurrencyLoading: boolean;
  setCurrency: (code: CurrencyCode) => void;
  /** Convert a USD numeric value to the display currency */
  convert: (usd: number) => number;
  /** Format a USD amount with the display currency symbol + ≈ prefix when non-USD */
  formatDisplayPrice: (usd: number | null | undefined) => string;
  /** Compact price for tight UI (AssetCard) — no ≈, uses K/M/B for inflated currencies */
  formatCompactPrice: (usd: number | null | undefined) => string;
  /** Same as formatDisplayPrice but for large volumes (compact: K/M/B) */
  formatDisplayVolume: (usd: number | null | undefined) => string;
  /** Same as formatDisplayPrice but with sign prefix (+/-) */
  formatDisplaySigned: (usd: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>('USD');
  const [loaded, setLoaded] = useState(false);
  const [isCurrencySwitching, setIsCurrencySwitching] = useState(false);

  const { data: ratesData, refetch: refetchRates } = useQuery({
    queryKey: ['forex-rates'],
    queryFn: fetchForexRates,
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    retry: 2,
    enabled: SHOW_DISPLAY_CURRENCY_UI,
  });

  const rates = normalizeForexRates(ratesData?.rates);

  useEffect(() => {
    AsyncStorage.getItem(CURRENCY_KEY)
      .then((saved) => {
        const code = normalizeStoredCurrency(saved);
        if (code) {
          setCurrencyState(code);
          if (saved && saved !== code) {
            AsyncStorage.setItem(CURRENCY_KEY, code).catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setCurrency = useCallback((code: CurrencyCode) => {
    setCurrencyState((prev) => {
      if (prev !== code) {
        setIsCurrencySwitching(true);
      }
      return code;
    });
    AsyncStorage.setItem(CURRENCY_KEY, code).catch(() => {});
  }, []);

  const meta = useMemo(() => CURRENCY_MAP.get(currency) ?? SUPPORTED_CURRENCIES[0], [currency]);
  const isConverted = SHOW_DISPLAY_CURRENCY_UI && currency !== 'USD';
  const selectedRate = currency === 'USD' ? 1 : rates?.[currency];
  const isCurrencyRateReady =
    currency === 'USD' ||
    (typeof selectedRate === 'number' && Number.isFinite(selectedRate));
  const isDisplayCurrencyLoading = isCurrencySwitching || !isCurrencyRateReady;
  const rate = isCurrencyRateReady ? (selectedRate as number) : 1;

  useEffect(() => {
    if (currency === 'USD') return;
    if (!rates) return;
    if (!isCurrencyRateReady) {
      void refetchRates();
    }
  }, [currency, isCurrencyRateReady, rates, refetchRates]);

  useEffect(() => {
    if (!isCurrencySwitching) return;
    if (!isCurrencyRateReady) return;
    const t = setTimeout(() => setIsCurrencySwitching(false), 220);
    return () => clearTimeout(t);
  }, [currency, isCurrencyRateReady, isCurrencySwitching]);

  const convert = useCallback(
    (usd: number): number => {
      if (!isConverted || !rates || !isCurrencyRateReady) return usd;
      return usd * rate;
    },
    [isConverted, isCurrencyRateReady, rates, rate],
  );

  /** Format a converted absolute value with smart precision and optional K/M/B. */
  const fmtLocal = useCallback(
    (abs: number, compact: boolean): string => {
      const d = meta.decimals;
      // Inflated FX (e.g. TRY, IDR) hits 1M+ often — always shorten M/B/T, not only for compact or 0-decimal currencies.
      if (abs >= 1e12) return `${(abs / 1e12).toFixed(1)}T`;
      if (abs >= 1e9) return `${(abs / 1e9).toFixed(3)}B`;
      if (abs >= 1e6) return `${(abs / 1e6).toFixed(3)}M`;
      if (compact || d === 0) {
        if (abs >= 1e5) return `${(abs / 1e3).toFixed(0)}K`;
        if (abs >= 1e4 && compact) return `${(abs / 1e3).toFixed(1)}K`;
      }
      if (d === 0) return Math.round(abs).toLocaleString('en-US');
      if (abs >= 1000) return abs.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
      if (abs >= 1) return abs.toFixed(d);
      return abs.toFixed(Math.max(d, 2));
    },
    [meta.decimals],
  );

  /**
   * USD display: optional 3rd decimal only for $1–$99.99 (cheap assets / fine tick).
   * $100+ and $1k+ use 2 decimals — avoids awkward values like $375.565 for ZEC.
   */
  const fmtUsd = useCallback((usd: number): string => {
    const abs = Math.abs(usd);
    if (abs >= 1000) {
      return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (abs >= 100) {
      return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (abs >= 1) {
      return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
    }
    if (abs >= 0.01) return `$${usd.toFixed(4)}`;
    // Exact / near-zero: avoid $0.000000 on empty accounts (was confusing after login)
    if (!abs || abs < 1e-10) return '$0.00';
    return `$${usd.toFixed(6)}`;
  }, []);

  const formatDisplayPrice = useCallback(
    (usd: number | null | undefined): string => {
      if (usd == null || !Number.isFinite(usd)) return '--';
      if (!isConverted) return fmtUsd(usd);
      if (!isCurrencyRateReady) return '--';
      const val = usd * rate;
      return `≈ ${meta.symbol}${fmtLocal(Math.abs(val), false)}`;
    },
    [isConverted, isCurrencyRateReady, rate, meta.symbol, fmtLocal, fmtUsd],
  );

  const formatCompactPrice = useCallback(
    (usd: number | null | undefined): string => {
      if (usd == null || !Number.isFinite(usd)) return '--';
      if (!isConverted) return fmtUsd(usd);
      if (!isCurrencyRateReady) return '--';
      const val = Math.abs(usd * rate);
      return `${meta.symbol}${fmtLocal(val, true)}`;
    },
    [isConverted, isCurrencyRateReady, rate, meta.symbol, fmtLocal, fmtUsd],
  );

  const formatDisplayVolume = useCallback(
    (usd: number | null | undefined): string => {
      if (usd == null || !Number.isFinite(usd)) return '--';
      if (isConverted && !isCurrencyRateReady) return '--';
      const val = isConverted ? usd * rate : usd;
      const sym = isConverted ? meta.symbol : '$';
      const abs = Math.abs(val);
      if (abs >= 1e12) return `${sym}${(abs / 1e12).toFixed(3)}T`;
      if (abs >= 1e9) return `${sym}${(abs / 1e9).toFixed(3)}B`;
      if (abs >= 1e6) return `${sym}${(abs / 1e6).toFixed(3)}M`;
      if (abs >= 1e3) return `${sym}${(abs / 1e3).toFixed(2)}K`;
      if (!isConverted) {
        if (abs >= 100) {
          return `${sym}${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        if (abs >= 1) {
          return `${sym}${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
        }
        if (abs >= 0.01) return `${sym}${abs.toFixed(4)}`;
        if (!abs || abs < 1e-10) return `${sym}0.00`;
        return `${sym}${abs.toFixed(6)}`;
      }
      return `${sym}${abs.toFixed(meta.decimals)}`;
    },
    [isConverted, isCurrencyRateReady, rate, meta.symbol, meta.decimals],
  );

  const formatDisplaySigned = useCallback(
    (usd: number): string => {
      if (!Number.isFinite(usd)) return '--';
      const sign = usd >= 0 ? '+' : '-';
      if (!isConverted) {
        const a = Math.abs(usd);
        let body: string;
        if (a >= 1000) {
          body = a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else if (a >= 100) {
          body = a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else if (a >= 1) {
          body = a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
        } else if (a >= 0.01) {
          body = a.toFixed(4);
        } else if (!a || a < 1e-10) {
          body = '0.00';
        } else {
          body = a.toFixed(6);
        }
        return `${sign}$${body}`;
      }
      if (!isCurrencyRateReady) return '--';
      const val = Math.abs(usd) * rate;
      return `≈ ${sign}${meta.symbol}${fmtLocal(val, false)}`;
    },
    [isConverted, isCurrencyRateReady, rate, meta.symbol, fmtLocal],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      meta,
      rates,
      isConverted,
      isDisplayCurrencyLoading,
      setCurrency,
      convert,
      formatDisplayPrice,
      formatCompactPrice,
      formatDisplayVolume,
      formatDisplaySigned,
    }),
    [currency, meta, rates, isConverted, isDisplayCurrencyLoading, setCurrency, convert, formatDisplayPrice, formatCompactPrice, formatDisplayVolume, formatDisplaySigned],
  );

  if (!loaded) return null;

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useDisplayCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error('useDisplayCurrency must be used within <CurrencyProvider>');
  }
  return ctx;
}
