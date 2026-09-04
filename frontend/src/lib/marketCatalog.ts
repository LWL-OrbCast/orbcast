import {
  MIN_OUTCOME_NOTIONAL_USD,
  marketSpecFields,
  questionTicketMarket,
  topMarketsByVolume,
  type ListedMarket,
} from './hip4';
import {
  chipFromSportSignals,
  SPORT_ONLY_CHIPS,
  type SportChipId,
  type SportOnlyChipId,
} from './sportsCatalog';

export {
  API_SPORTS_PRODUCTS,
  CATALOG_CHIPS,
  SPORT_CHIP_RE,
  SPORT_ONLY_CHIPS,
  chipFromSportSignals,
  type ApiSportsProduct,
  type SportChipId,
  type SportOnlyChipId,
  type TopicChipId,
} from './sportsCatalog';

/** One min-size fill. Below this, a book is quiet and sorts after active ones. */
export const CATALOG_VOLUME_FLOOR_USD = MIN_OUTCOME_NOTIONAL_USD;

/** 0 = show normally. 1 = visibility penalty (low tape / liquidity). */
export function catalogVisibilityPenalty(market: ListedMarket): number {
  return (market.volumeUsd ?? 0) + 1e-9 >= CATALOG_VOLUME_FLOOR_USD ? 0 : 1;
}

function compareVisibility(a: ListedMarket, b: ListedMarket): number {
  return catalogVisibilityPenalty(a) - catalogVisibilityPenalty(b);
}

/**
 * Catalog chips. UI copy is Live / Upcoming / Ending soon.
 *
 * `'open'` is the API/code name for “unsettled books”. The chip label is **Live**
 * (`hip4.markets.live`). Do not rename this union member to `'live'` — that
 * already means in-play on `ListedMarket.status`.
 */
export type MarketCatalogView = 'endingSoon' | 'open' | 'upcoming';

const CRYPTO_RE =
  /\b(btc|bitcoin|eth|ether|ethereum|solana|sol|hype|doge|xrp|bnb|pepe|wif|crypto|defi|memecoin|hyperliquid|price\s*binary|price\s*bucket)\b/i;

const ECONOMICS_RE =
  /\b(fomc|fed|federal reserve|ecb|boe|central bank|interest rate|policy rate|rate decision|rate cut|rate hike|cpi|nfp|non[- ]?farm|payroll|inflation|gdp|unemployment|macro|economics?|policy question|treasury)\b/i;

/** HIP-3 perp coin in HIP-4 metadata (`xyz:SNDK`). Not `template:…` names. */
const HIP3_COIN_RE = /^[a-z0-9]{2,6}:[a-z0-9][a-z0-9._-]*$/i;
const HIP3_COIN_IN_TEXT_RE = /\b[a-z]{2,6}:[a-z0-9][a-z0-9._-]*/i;

export function marketSearchBlob(m: ListedMarket): string {
  return [
    m.title,
    m.subtitle,
    m.legLabel,
    m.questionName,
    m.venue,
    m.raw.name,
    m.raw.description,
    m.questionDescription,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function catalogTopicBlob(m: ListedMarket): string {
  return marketSearchBlob(m);
}

/** Map a sports book onto a sport chip. Unknown sports stay off the named chips. */
export function sportOnlyChipForMarket(m: ListedMarket): SportOnlyChipId | null {
  if (!m.isSports) return null;
  const fields = marketSpecFields(m);
  return chipFromSportSignals(fields.sport, fields.competition, catalogTopicBlob(m));
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
  const fields = marketSpecFields(m);
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
  const fields = marketSpecFields(m);
  if (fields.class === 'priceBinary' || fields.class === 'priceBucket') return true;
  const blob = catalogTopicBlob(m);
  if (/category:crypto|subCategory:crypto/i.test(blob)) return true;
  return CRYPTO_RE.test(blob);
}

/** Fed / FOMC / macro. Crypto and HIP-3-oracle price books stay in their own chips. */
export function isEconomicsCatalogMarket(m: ListedMarket): boolean {
  if (m.isSports || isStocksCatalogMarket(m) || isCryptoCatalogMarket(m)) return false;
  if (m.templateId && /^(policy|macro)/i.test(m.templateId)) return true;
  const fields = marketSpecFields(m);
  if (fields.institution || fields.policyMeasure || fields.decisionLabel) return true;
  const blob = catalogTopicBlob(m);
  if (/category:economics|subCategory:economics|category:macro|subCategory:macro/i.test(blob)) {
    return true;
  }
  return ECONOMICS_RE.test(blob);
}

export function catalogChipForMarket(m: ListedMarket): SportChipId {
  if (m.isSports) {
    return sportOnlyChipForMarket(m) ?? 'all';
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
  return markets.filter((m) => sportOnlyChipForMarket(m) === chip);
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

/**
 * Home Featured / Trending respect the catalog chip.
 * All → mix (featured prefers sports books so the hero is not a BTC daily).
 * A named chip → only that category.
 */
export function trendingCatalogMarkets(
  markets: ListedMarket[],
  chip: SportChipId,
  limit: number,
): ListedMarket[] {
  return topMarketsByVolume(applySportChip(markets, chip), limit);
}

/** Local calendar day `[start, end)`. HIP-4 times are UTC; “today” is the user’s day. */
export function localDayBounds(now = Date.now()): { start: number; end: number } {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const start = d.getTime();
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

export function isTimestampOnLocalDay(ms: number | null | undefined, now = Date.now()): boolean {
  if (ms == null) return false;
  const { start, end } = localDayBounds(now);
  return ms >= start && ms < end;
}

/** Contest length vs season-long books (`startsAt` null + expiry next year). */
const TODAY_CONTEST_SPAN_MS = 48 * 60 * 60 * 1000;

/**
 * Featured “today” = kickoff today, settles today, or a short in-play contest
 * that started yesterday and is still running. Season winners are excluded.
 */
export function isTodaysCatalogEvent(m: ListedMarket, now = Date.now()): boolean {
  if (m.status === 'settled') return false;
  const { start, end } = localDayBounds(now);
  if (m.startsAt != null && m.startsAt >= start && m.startsAt < end) return true;
  if (m.expiresAt != null && m.expiresAt >= start && m.expiresAt < end) return true;
  if (
    m.startsAt != null &&
    m.startsAt < start &&
    m.expiresAt != null &&
    m.expiresAt > now &&
    m.expiresAt - m.startsAt <= TODAY_CONTEST_SPAN_MS
  ) {
    return true;
  }
  return false;
}

/** All hero: one book per category first so UEFA / NFL / LoL / MLB / Fed can share the slider. */
const FEATURED_MIX_CHIPS: SportChipId[] = [
  'football',
  'nfl',
  'esports',
  'mlb',
  'crypto',
  'economics',
  'stocks',
  ...SPORT_ONLY_CHIPS.filter(
    (id) => id !== 'football' && id !== 'nfl' && id !== 'esports' && id !== 'mlb',
  ),
];

function questionVolumeUsd(catalog: ListedMarket[], m: ListedMarket): number {
  if (m.questionId == null) return m.volumeUsd ?? 0;
  return catalog
    .filter((row) => row.questionId === m.questionId)
    .reduce((sum, row) => sum + (row.volumeUsd ?? 0), 0);
}

function uniqueQuestionLeads(pool: ListedMarket[], catalog: ListedMarket[]): ListedMarket[] {
  const out: ListedMarket[] = [];
  const seen = new Set<number>();
  for (const m of pool) {
    if (m.questionId != null) {
      if (seen.has(m.questionId)) continue;
      seen.add(m.questionId);
      out.push(questionTicketMarket(catalog, m));
    } else {
      out.push(m);
    }
  }
  return out;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Slider order: ending soon → upcoming kickoff → live → later → long-dated.
 * Season winners (30d+ to settle) sit last.
 */
export function featuredUrgencyRank(m: ListedMarket, now = Date.now()): number {
  const expLeft = m.expiresAt != null ? m.expiresAt - now : Number.POSITIVE_INFINITY;
  const startLeft = m.startsAt != null ? m.startsAt - now : Number.POSITIVE_INFINITY;
  if (expLeft > 0 && expLeft <= 48 * HOUR_MS) return 0;
  if (startLeft > 0 && startLeft <= 7 * DAY_MS) return 1;
  if (m.status === 'live') return 2;
  if (m.status === 'upcoming') return 3;
  if (expLeft > 30 * DAY_MS) return 5;
  return 4;
}

function featuredSoonMs(m: ListedMarket, now: number): number {
  if (m.startsAt != null && m.startsAt > now) return m.startsAt;
  if (m.expiresAt != null && m.expiresAt > now) return m.expiresAt;
  return Number.POSITIVE_INFINITY;
}

function compareFeaturedLead(catalog: ListedMarket[], now: number) {
  return (a: ListedMarket, b: ListedMarket) => {
    const ur = featuredUrgencyRank(a, now) - featuredUrgencyRank(b, now);
    if (ur !== 0) return ur;
    const soon = featuredSoonMs(a, now) - featuredSoonMs(b, now);
    if (soon !== 0) return soon;
    const multi = Number(b.multiOutcome) - Number(a.multiOutcome);
    if (multi !== 0) return multi;
    return questionVolumeUsd(catalog, b) - questionVolumeUsd(catalog, a);
  };
}

function mixFeaturedByChip(leads: ListedMarket[], catalog: ListedMarket[], limit: number, now: number) {
  const rank = compareFeaturedLead(catalog, now);
  const buckets = new Map<SportChipId, ListedMarket[]>();
  for (const m of leads) {
    const id = catalogChipForMarket(m);
    const list = buckets.get(id) ?? [];
    list.push(m);
    buckets.set(id, list);
  }
  for (const list of buckets.values()) list.sort(rank);

  // One lead per chip, then keep the most urgent — do not fill football→NFL→…
  // first and drop Economics because it is later in FEATURED_MIX_CHIPS.
  const firsts: ListedMarket[] = [];
  const seen = new Set<string>();
  for (const id of FEATURED_MIX_CHIPS) {
    const next = buckets.get(id)?.[0];
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    firsts.push(next);
  }
  const out = firsts.sort(rank).slice(0, limit);
  const picked = new Set(out.map((m) => m.id));
  if (out.length < limit) {
    for (const m of [...leads].sort(rank)) {
      if (picked.has(m.id)) continue;
      picked.add(m.id);
      out.push(m);
      if (out.length >= limit) break;
    }
  }
  return out.sort(rank);
}

/**
 * Home featured slider. All = one lead per category, then the `limit`
 * most urgent (ending soon → upcoming → live → long-dated). Named chip
 * = that category only.
 */
export function featuredCatalogMarkets(
  markets: ListedMarket[],
  chip: SportChipId,
  limit = 5,
): ListedMarket[] {
  const now = Date.now();
  const leads = uniqueQuestionLeads(openMarkets(applySportChip(markets, chip)), markets);
  if (chip === 'all') return mixFeaturedByChip(leads, markets, limit, now);
  return [...leads].sort(compareFeaturedLead(markets, now)).slice(0, limit);
}
