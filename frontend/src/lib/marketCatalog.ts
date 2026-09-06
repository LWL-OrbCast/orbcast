import {
  MIN_OUTCOME_NOTIONAL_USD,
  displayFeaturedHeading,
  marketSpecFields,
  parseOutcomeDateTime,
  questionTicketMarket,
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

/** Catalog chip “Ending soon”: expire within this window (or already past expiry). */
export const ENDING_SOON_WINDOW_MS = 48 * 60 * 60 * 1000;

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
  /\b(btc|bitcoin|eth|ether|ethereum|solana|sol|hype|zec|zcash|pons|doge|xrp|bnb|pepe|wif|crypto|defi|memecoin|hyperliquid|price\s*binary|price\s*bucket)\b/i;

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

function teamSlug(name: string): string {
  let s = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  s = s.replace(/^(afc|ssc|scf|ac|fc|cf|sc)/, '');
  s = s.replace(/(afc|fc|cf)$/, '');
  return s || name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function teamKeys(name: string): string[] {
  const s = teamSlug(name);
  const keys = new Set<string>([s]);
  if (/manchesterunited|manunited|manutd/.test(s)) {
    keys.add('manchesterunited');
    keys.add('manunited');
    keys.add('manutd');
  }
  if (/manchestercity|mancity/.test(s)) {
    keys.add('manchestercity');
    keys.add('mancity');
  }
  if (/(^|fc)barcelona/.test(s) || s === 'barca') {
    keys.add('barcelona');
    keys.add('fcbarcelona');
  }
  if (/tottenham/.test(s)) keys.add('tottenhamhotspur');
  if (/parisaintgermain|psg/.test(s)) {
    keys.add('parissaintgermain');
    keys.add('psg');
  }
  if (/atletico/.test(s)) {
    keys.add('atleticomadrid');
    keys.add('atleticodemadrid');
  }
  if (s === 'inter' || s === 'intermilan' || s === 'internazionale') {
    keys.add('inter');
    keys.add('intermilan');
    keys.add('internazionale');
  }
  if (/athletic/.test(s)) {
    keys.add('athleticclub');
    keys.add('athleticbilbao');
  }
  return [...keys].filter(Boolean);
}

function teamsMatch(a: string, b: string): boolean {
  const A = teamKeys(a);
  const B = teamKeys(b);
  return A.some((x) => B.some((y) => x === y || x.includes(y) || y.includes(x)));
}

export function contestParticipants(m: ListedMarket): [string, string] | null {
  const fields = marketSpecFields(m);
  let a = (fields.participantA ?? '').trim();
  let b = (fields.participantB ?? '').trim();
  if (!a || !b) {
    const parts = displayFeaturedHeading(m).split(/\s+v(?:s\.?)?\s+/i);
    if (parts.length === 2) {
      a = parts[0].trim();
      b = parts[1].trim();
    }
  }
  if (!a || !b) return null;
  return [a, b];
}

/** Same fixture on any venue (order-independent). */
export function marketMatchesFixture(m: ListedMarket, home: string, away: string): boolean {
  if (!home.trim() || !away.trim()) return false;
  const pair = contestParticipants(m);
  if (!pair) return false;
  const [a, b] = pair;
  return (
    (teamsMatch(a, home) && teamsMatch(b, away)) ||
    (teamsMatch(a, away) && teamsMatch(b, home))
  );
}

/** Association-football match book (two clubs), not a season winner. */
export function isFootballContestMarket(m: ListedMarket): boolean {
  return sportOnlyChipForMarket(m) === 'football' && contestParticipants(m) != null;
}

export function fixtureForMarket<T extends { home: { name: string }; away: { name: string } }>(
  fixtures: readonly T[],
  m: ListedMarket,
): T | null {
  for (const f of fixtures) {
    if (marketMatchesFixture(m, f.home.name, f.away.name)) return f;
  }
  return null;
}

/** HIP-4 contest whose two sides are this fixture (order-independent). */
export function hip4ContestForTeams(
  markets: ListedMarket[],
  home: string,
  away: string,
  heldOutcomeIds?: Iterable<number> | null,
): ListedMarket | null {
  const hits: ListedMarket[] = [];
  for (const m of markets) {
    if (marketMatchesFixture(m, home, away)) {
      hits.push(questionTicketMarket(markets, m, heldOutcomeIds));
    }
  }
  if (!hits.length) return null;
  const uniq = [...new Map(hits.map((m) => [m.id, m])).values()];
  return pickPreferredVenueLeads(uniq, markets, heldOutcomeIds)[0] ?? uniq[0];
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

/** Unsettled book with a known expiry at or before `now + 48h`. */
export function isEndingSoonMarket(m: ListedMarket, now = Date.now()): boolean {
  if (m.status === 'settled' || m.expiresAt == null) return false;
  return m.expiresAt <= now + ENDING_SOON_WINDOW_MS;
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
  if (view === 'endingSoon') return sortEndingSoon(open.filter((m) => isEndingSoonMarket(m)));
  return sortByCatalogVisibility(open);
}

export function applySearch(markets: ListedMarket[], q: string): ListedMarket[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return markets;
  return markets.filter((m) => marketSearchBlob(m).includes(needle));
}

function asHeldSet(held?: Iterable<number> | null): Set<number> {
  if (!held) return new Set();
  return held instanceof Set ? held : new Set(held);
}

function questionHeld(catalog: ListedMarket[], m: ListedMarket, held: Set<number>): boolean {
  if (held.has(m.outcomeId)) return true;
  if (m.questionId == null) return false;
  return catalog.some((row) => row.questionId === m.questionId && held.has(row.outcomeId));
}

function utcDay(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

function contestDay(m: ListedMarket): string {
  const f = marketSpecFields(m);
  return (
    utcDay(m.startsAt) ||
    utcDay(parseOutcomeDateTime(f.scheduledStart ?? f.time ?? '')) ||
    utcDay(m.expiresAt)
  );
}

function contestWhenMs(m: ListedMarket): number | null {
  const f = marketSpecFields(m);
  return m.startsAt ?? parseOutcomeDateTime(f.scheduledStart ?? f.time ?? '') ?? m.expiresAt ?? null;
}

function canonicalTeam(name: string): string {
  const keys = teamKeys(name);
  return keys.sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? teamSlug(name);
}

/** Same two clubs on any venue — `out` + `txyz` copies of one fixture. */
export function sameContestEvent(a: ListedMarket, b: ListedMarket): boolean {
  if (a.id === b.id) return true;
  const ka = catalogEventKey(a);
  const kb = catalogEventKey(b);
  if (ka && kb && ka === kb) return true;
  const pa = contestParticipants(a);
  const pb = contestParticipants(b);
  if (!pa || !pb) return false;
  const teams =
    (teamsMatch(pa[0], pb[0]) && teamsMatch(pa[1], pb[1])) ||
    (teamsMatch(pa[0], pb[1]) && teamsMatch(pa[1], pb[0]));
  if (!teams) return false;
  const da = contestDay(a);
  const db = contestDay(b);
  if (!da || !db || da === db) return true;
  const ta = contestWhenMs(a);
  const tb = contestWhenMs(b);
  if (ta == null || tb == null) return true;
  return Math.abs(ta - tb) <= 36 * 60 * 60 * 1000;
}

/** Venue-agnostic event id so `out` + `txyz` copies of the same fixture collapse. */
export function catalogEventKey(m: ListedMarket): string | null {
  const f = marketSpecFields(m);
  const pairNames = contestParticipants(m);
  if (pairNames) {
    const pair = [canonicalTeam(pairNames[0]), canonicalTeam(pairNames[1])].sort().join('|');
    const when =
      utcDay(m.startsAt) ||
      utcDay(parseOutcomeDateTime(f.scheduledStart ?? f.time ?? '')) ||
      utcDay(m.expiresAt);
    if (!pair || pair === '|') return null;
    return `contest:${pair}:${when}`;
  }

  const title = `${m.questionName ?? ''} ${m.title ?? ''}`;
  const winner =
    /winner|outright|champion/i.test(title) ||
    /winner|outright/i.test(m.templateId ?? '') ||
    Boolean(m.multiOutcome && f.competition && f.season);
  if (winner) {
    if (f.competition) {
      return `winner:${teamSlug(f.competition)}:${teamSlug(f.season ?? '') || utcDay(m.expiresAt).slice(0, 4)}`;
    }
    const qn = teamSlug(m.questionName ?? '');
    if (qn) return `winner:${qn}`;
  }

  const u = f.underlying ?? f.perp ?? f.hlPerp ?? '';
  const px = f.targetPrice ?? f.threshold ?? f.priceThresholds ?? '';
  if (u && px) return `px:${teamSlug(u)}:${px}:${utcDay(m.expiresAt)}`;
  return null;
}

function expandSearchHits(pool: ListedMarket[], query: string): ListedMarket[] {
  const hits = applySearch(pool, query);
  if (!query.trim()) return pool;
  const qids = new Set<number>();
  for (const m of hits) {
    if (m.questionId != null) qids.add(m.questionId);
  }
  if (!qids.size) return hits;
  const byId = new Map(hits.map((m) => [m.id, m]));
  for (const m of pool) {
    if (m.questionId != null && qids.has(m.questionId)) byId.set(m.id, m);
  }
  return [...byId.values()];
}

/**
 * One catalog card per question. Same fixture on two venues → keep the copy
 * the user already holds; otherwise the higher-volume venue. Holding both
 * venues keeps both cards.
 */
export function pickPreferredVenueLeads(
  leads: ListedMarket[],
  catalog: ListedMarket[],
  heldOutcomeIds?: Iterable<number> | null,
): ListedMarket[] {
  const held = asHeldSet(heldOutcomeIds);
  const buckets = new Map<string, ListedMarket[]>();
  const unmatched: ListedMarket[] = [];
  for (const m of leads) {
    const key = catalogEventKey(m);
    if (!key) {
      unmatched.push(m);
      continue;
    }
    const list = buckets.get(key) ?? [];
    list.push(m);
    buckets.set(key, list);
  }
  const out = [...unmatched];
  for (const group of buckets.values()) {
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }
    const heldCopies = group.filter((m) => questionHeld(catalog, m, held));
    if (heldCopies.length === 1) {
      out.push(heldCopies[0]!);
      continue;
    }
    if (heldCopies.length > 1) {
      out.push(...heldCopies);
      continue;
    }
    const ranked = [...group].sort(
      (a, b) => questionVolumeUsd(catalog, b) - questionVolumeUsd(catalog, a),
    );
    out.push(ranked[0]!);
  }
  return collapseContestLeads(out, catalog, held);
}

function preferVenueLead(
  a: ListedMarket,
  b: ListedMarket,
  catalog: ListedMarket[],
  held: Set<number>,
): ListedMarket | 'both' {
  const ah = questionHeld(catalog, a, held);
  const bh = questionHeld(catalog, b, held);
  if (ah && bh && a.id !== b.id) return 'both';
  if (ah && !bh) return a;
  if (bh && !ah) return b;
  return questionVolumeUsd(catalog, a) >= questionVolumeUsd(catalog, b) ? a : b;
}

/** Second pass: team-name / kickoff drift that `catalogEventKey` missed. */
function collapseContestLeads(
  leads: ListedMarket[],
  catalog: ListedMarket[],
  held: Set<number>,
): ListedMarket[] {
  const kept: ListedMarket[] = [];
  for (const m of leads) {
    const i = kept.findIndex((row) => sameContestEvent(row, m));
    if (i < 0) {
      kept.push(m);
      continue;
    }
    const pick = preferVenueLead(kept[i]!, m, catalog, held);
    if (pick === 'both') {
      if (!kept.some((row) => row.id === m.id)) kept.push(m);
    } else {
      kept[i] = pick;
    }
  }
  return kept;
}

export function catalogQuestionLeads(
  pool: ListedMarket[],
  catalog: ListedMarket[],
  heldOutcomeIds?: Iterable<number> | null,
): ListedMarket[] {
  const held = asHeldSet(heldOutcomeIds);
  const leads = uniqueQuestionLeads(pool, catalog, held);
  return pickPreferredVenueLeads(leads, catalog, held);
}

/** Live / Upcoming / Ending soon rows: one card per question, venue-aware. */
export function catalogListRows(
  all: ListedMarket[],
  view: MarketCatalogView,
  chip: SportChipId,
  query = '',
  heldOutcomeIds?: Iterable<number> | null,
): ListedMarket[] {
  const scoped = applySportChip(all, chip);
  const viewed = applyCatalogView(scoped, view);
  const pool = query.trim() ? expandSearchHits(viewed, query) : viewed;
  const leads = catalogQuestionLeads(pool, all, heldOutcomeIds);
  if (view === 'endingSoon') {
    return [...leads].sort((a, b) => {
      const vis =
        catalogVisibilityPenaltyForLead(all, a) - catalogVisibilityPenaltyForLead(all, b);
      if (vis !== 0) return vis;
      const ae = a.expiresAt ?? Number.POSITIVE_INFINITY;
      const be = b.expiresAt ?? Number.POSITIVE_INFINITY;
      if (ae !== be) return ae - be;
      return questionVolumeUsd(all, b) - questionVolumeUsd(all, a);
    });
  }
  return [...leads].sort((a, b) => {
    const vis = catalogVisibilityPenaltyForLead(all, a) - catalogVisibilityPenaltyForLead(all, b);
    if (vis !== 0) return vis;
    return questionVolumeUsd(all, b) - questionVolumeUsd(all, a);
  });
}

export function searchCatalogRows(
  all: ListedMarket[],
  query: string,
  heldOutcomeIds?: Iterable<number> | null,
): ListedMarket[] {
  const open = openMarkets(all);
  const pool = query.trim() ? expandSearchHits(open, query) : open;
  return catalogQuestionLeads(pool, all, heldOutcomeIds);
}

function catalogVisibilityPenaltyForLead(catalog: ListedMarket[], m: ListedMarket): number {
  return questionVolumeUsd(catalog, m) + 1e-9 >= CATALOG_VOLUME_FLOOR_USD ? 0 : 1;
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
  heldOutcomeIds?: Iterable<number> | null,
): ListedMarket[] {
  const scoped = openMarkets(applySportChip(markets, chip));
  const leads = catalogQuestionLeads(scoped, markets, heldOutcomeIds);
  return [...leads]
    .sort((a, b) => questionVolumeUsd(markets, b) - questionVolumeUsd(markets, a))
    .slice(0, limit);
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
const TODAY_CONTEST_SPAN_MS = ENDING_SOON_WINDOW_MS;

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
  'esports',
  'nfl',
  'mlb',
  'crypto',
  'economics',
  'stocks',
  ...SPORT_ONLY_CHIPS.filter(
    (id) => id !== 'football' && id !== 'nfl' && id !== 'esports' && id !== 'mlb',
  ),
];

/** Day tape for a catalog card: one book, or every leg on the same question. */
export function questionVolumeUsd(catalog: ListedMarket[], m: ListedMarket): number {
  if (m.questionId == null) return m.volumeUsd ?? 0;
  return catalog
    .filter((row) => row.questionId === m.questionId)
    .reduce((sum, row) => sum + (row.volumeUsd ?? 0), 0);
}

function uniqueQuestionLeads(
  pool: ListedMarket[],
  catalog: ListedMarket[],
  heldOutcomeIds?: Iterable<number> | null,
): ListedMarket[] {
  const out: ListedMarket[] = [];
  const seen = new Set<number>();
  for (const m of pool) {
    if (m.questionId != null) {
      if (seen.has(m.questionId)) continue;
      seen.add(m.questionId);
      out.push(questionTicketMarket(catalog, m, heldOutcomeIds));
    } else {
      out.push(m);
    }
  }
  return out;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Slider order: kickoff soon / in-play → ending soon → later kickoff → live
 * → upcoming → later → long-dated. Season winners (30d+ to settle) sit last.
 */
export function featuredUrgencyRank(m: ListedMarket, now = Date.now()): number {
  const expLeft = m.expiresAt != null ? m.expiresAt - now : Number.POSITIVE_INFINITY;
  const startLeft = m.startsAt != null ? m.startsAt - now : Number.POSITIVE_INFINITY;
  const notExpired = m.expiresAt == null || m.expiresAt > now;
  // Same-day / next-kickoff contests beat 48h tape so United–Everton is not
  // dropped from All for a 5-minute crypto binary.
  if (m.startsAt != null && notExpired && startLeft <= 36 * HOUR_MS && startLeft > -8 * HOUR_MS) {
    return 0;
  }
  if (expLeft > 0 && expLeft <= ENDING_SOON_WINDOW_MS) return 1;
  if (startLeft > 0 && startLeft <= 7 * DAY_MS) return 2;
  if (m.status === 'live') return 3;
  if (m.status === 'upcoming') return 4;
  if (expLeft > 30 * DAY_MS) return 6;
  return 5;
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
  heldOutcomeIds?: Iterable<number> | null,
): ListedMarket[] {
  const now = Date.now();
  const leads = catalogQuestionLeads(
    openMarkets(applySportChip(markets, chip)),
    markets,
    heldOutcomeIds,
  );
  if (chip === 'all') return mixFeaturedByChip(leads, markets, limit, now);
  return [...leads].sort(compareFeaturedLead(markets, now)).slice(0, limit);
}
