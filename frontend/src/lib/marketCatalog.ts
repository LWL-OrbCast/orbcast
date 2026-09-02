import { MIN_OUTCOME_NOTIONAL_USD, parsePipeFields, type ListedMarket } from './hip4';

/** One min-size fill. Below this, a book is quiet and sorts after active ones. */
export const CATALOG_VOLUME_FLOOR_USD = MIN_OUTCOME_NOTIONAL_USD;

/** 0 = show normally. 1 = visibility penalty (low tape / liquidity). */
export function catalogVisibilityPenalty(market: ListedMarket): number {
  return (market.volumeUsd ?? 0) + 1e-9 >= CATALOG_VOLUME_FLOOR_USD ? 0 : 1;
}

function compareVisibility(a: ListedMarket, b: ListedMarket): number {
  return catalogVisibilityPenalty(a) - catalogVisibilityPenalty(b);
}

/** Chip ids. Keep the type name — sports branding stays, Crypto/Stocks/Economics sit after All. */
export type SportChipId =
  | 'all'
  | 'crypto'
  | 'stocks'
  | 'economics'
  | 'football'
  | 'nba'
  | 'tennis'
  | 'mlb'
  | 'mma'
  | 'esports';

export type SportOnlyChipId = 'football' | 'nba' | 'tennis' | 'mlb' | 'mma' | 'esports';

/** All → Crypto → Stocks → Economics → sports. */
export const CATALOG_CHIPS: SportChipId[] = [
  'all',
  'crypto',
  'stocks',
  'economics',
  'football',
  'nba',
  'tennis',
  'mlb',
  'mma',
  'esports',
];

export const SPORT_ONLY_CHIPS: SportOnlyChipId[] = [
  'football',
  'nba',
  'tennis',
  'mlb',
  'mma',
  'esports',
];

/**
 * Catalog chips. UI copy is Live / Upcoming / Ending soon.
 *
 * `'open'` is the API/code name for “unsettled books”. The chip label is **Live**
 * (`hip4.markets.live`). Do not rename this union member to `'live'` — that
 * already means in-play on `ListedMarket.status`.
 */
export type MarketCatalogView = 'endingSoon' | 'open' | 'upcoming';

export const SPORT_CHIP_RE: Record<SportOnlyChipId, RegExp> = {
  football: /\b(football|soccer|fifa|uefa|premier|bundesliga|laliga|serie a|ligue 1|champions league|world\s*cup)\b/i,
  nba: /\b(nba|basketball)\b/i,
  tennis: /\b(tennis|atp|wta)\b/i,
  mlb: /\b(mlb|baseball)\b/i,
  mma: /\b(ufc|mma)\b/i,
  esports: /\b(esport|e-?sport|lol|league of legends|dota|cs2|counter.?strike|valorant|overwatch)\b/i,
};

const CRYPTO_RE =
  /\b(btc|bitcoin|eth|ether|ethereum|solana|sol|hype|doge|xrp|bnb|pepe|wif|crypto|defi|memecoin|hyperliquid|price\s*binary|price\s*bucket)\b/i;

const ECONOMICS_RE =
  /\b(fomc|fed|federal reserve|ecb|boe|central bank|interest rate|policy rate|rate decision|rate cut|rate hike|cpi|nfp|non[- ]?farm|payroll|inflation|gdp|unemployment|macro|economics?|policy question|treasury)\b/i;

/** HIP-3 perp coin in HIP-4 metadata (`xyz:SNDK`). Not `template:…` names. */
const HIP3_COIN_RE = /^[a-z0-9]{2,6}:[a-z0-9][a-z0-9._-]*$/i;
const HIP3_COIN_IN_TEXT_RE = /\b[a-z]{2,6}:[a-z0-9][a-z0-9._-]*/i;

export function marketSearchBlob(m: ListedMarket): string {
  return [m.title, m.subtitle, m.legLabel, m.questionName, m.venue, m.raw.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function catalogTopicBlob(m: ListedMarket): string {
  return `${marketSearchBlob(m)} ${m.raw.description ?? ''}`.toLowerCase();
}

function isHip3OracleCoin(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (/^template:/i.test(v)) return false;
  return v.includes(':') && HIP3_COIN_RE.test(v);
}

/**
 * HIP-4 price book whose oracle is a HIP-3 perp (`xyz:SNDK`, `xyz:GOLD`, …).
 * Colon lives in `underlying` / `perp` (hlPerp keyword). Do not treat this as HIP-3 trading.
 */
export function hip3OracleUnderlying(m: ListedMarket): string | null {
  const fields = parsePipeFields(m.raw.description);
  for (const v of [fields.underlying, fields.perp, fields.hlPerp, fields.coin]) {
    if (isHip3OracleCoin(v)) return v.trim();
  }
  const text = [m.title, m.subtitle, m.legLabel].filter(Boolean).join(' ');
  const hit = text.match(HIP3_COIN_IN_TEXT_RE);
  if (hit && !/^template:/i.test(hit[0])) return hit[0];
  return null;
}

export function isStocksCatalogMarket(m: ListedMarket): boolean {
  if (m.isSports) return false;
  return hip3OracleUnderlying(m) != null;
}

/** Native crypto price books (BTC/ETH/…). HIP-3-oracle books are Stocks, not Crypto. */
export function isCryptoCatalogMarket(m: ListedMarket): boolean {
  if (m.isSports || isStocksCatalogMarket(m)) return false;
  const fields = parsePipeFields(m.raw.description);
  if (fields.class === 'priceBinary' || fields.class === 'priceBucket') return true;
  const blob = catalogTopicBlob(m);
  if (/category:crypto|subCategory:crypto/i.test(blob)) return true;
  return CRYPTO_RE.test(blob);
}

/** Fed / FOMC / macro. Crypto and HIP-3-oracle price books stay in their own chips. */
export function isEconomicsCatalogMarket(m: ListedMarket): boolean {
  if (m.isSports || isStocksCatalogMarket(m) || isCryptoCatalogMarket(m)) return false;
  const fields = parsePipeFields(m.raw.description);
  if (fields.institution || fields.policyMeasure || fields.decisionLabel) return true;
  const blob = catalogTopicBlob(m);
  if (/category:economics|subCategory:economics|category:macro|subCategory:macro/i.test(blob)) {
    return true;
  }
  return ECONOMICS_RE.test(blob);
}

export function catalogChipForMarket(m: ListedMarket): SportChipId {
  if (m.isSports) {
    const blob = marketSearchBlob(m);
    for (const id of SPORT_ONLY_CHIPS) {
      if (SPORT_CHIP_RE[id].test(blob)) return id;
    }
    return 'football';
  }
  if (isStocksCatalogMarket(m)) return 'stocks';
  if (isCryptoCatalogMarket(m)) return 'crypto';
  if (isEconomicsCatalogMarket(m)) return 'economics';
  return 'all';
}

export function applySportChip(markets: ListedMarket[], chip: SportChipId): ListedMarket[] {
  if (chip === 'all') return markets;
  if (chip === 'crypto') return markets.filter(isCryptoCatalogMarket);
  if (chip === 'stocks') return markets.filter(isStocksCatalogMarket);
  if (chip === 'economics') return markets.filter(isEconomicsCatalogMarket);
  const re = SPORT_CHIP_RE[chip];
  return markets.filter((m) => m.isSports && re.test(marketSearchBlob(m)));
}

export function catalogEmptyKind(
  chip: SportChipId,
  rowCount: number,
): 'crypto' | 'stocks' | 'economics' | 'sports' | null {
  if (rowCount > 0 || chip === 'all') return null;
  if (chip === 'crypto') return 'crypto';
  if (chip === 'stocks') return 'stocks';
  if (chip === 'economics') return 'economics';
  return 'sports';
}

export function openMarkets(markets: ListedMarket[]): ListedMarket[] {
  return markets.filter((m) => m.status !== 'settled');
}

/**
 * Quiet books sort after books with real tape. Then closest settle.
 * Unknown expiry last. Volume breaks remaining ties.
 */
export function sortEndingSoon(markets: ListedMarket[]): ListedMarket[] {
  return [...markets].sort((a, b) => {
    const vis = compareVisibility(a, b);
    if (vis !== 0) return vis;
    const ae = a.expiresAt ?? Number.POSITIVE_INFINITY;
    const be = b.expiresAt ?? Number.POSITIVE_INFINITY;
    if (ae !== be) return ae - be;
    return (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0);
  });
}

/** Same volume penalty as Ending soon, then keep the incoming order (stable). */
export function sortByCatalogVisibility(markets: ListedMarket[]): ListedMarket[] {
  return [...markets].sort(compareVisibility);
}

export function applyCatalogView(
  markets: ListedMarket[],
  view: MarketCatalogView,
): ListedMarket[] {
  if (view === 'upcoming') {
    return markets.filter((m) => m.status === 'upcoming');
  }
  const open = openMarkets(markets);
  if (view === 'endingSoon') return sortEndingSoon(open);
  return sortByCatalogVisibility(open);
}

export function applySearch(markets: ListedMarket[], q: string): ListedMarket[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return markets;
  return markets.filter((m) => marketSearchBlob(m).includes(needle));
}
