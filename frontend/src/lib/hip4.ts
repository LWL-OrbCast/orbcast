/**
 * HIP-4 outcome client — start here. Do not route orders through placeOrder()
 * in hyperliquid.ts (that path is perps / HIP-3).
 *
 * Docs:
 * https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets
 * https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids
 * https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions
 */

import { formatPrice, formatSize } from '@nktkas/hyperliquid/utils';
import { hlExchangeUrl, hlInfoUrl } from './hlEndpoints';
import { getHip4Runtime, requireHip4Runtime } from './hip4Runtime';

export type OutcomeSide = 0 | 1;
export type OutcomeFilter = 'all' | 'sports';
/**
 * Book state from expiry / kickoff — not catalog-chip copy.
 * UI catalog **Live** = view `'open'` (all unsettled). This `'live'` = in-play.
 * `'upcoming'` = `startsAt` still in the future (sports pre-match).
 */
export type MarketStatus = 'live' | 'upcoming' | 'settled';
export type Hex = `0x${string}`;

export class Hip4Error extends Error {
  readonly raw: string;
  constructor(message: string, raw?: string) {
    super(message);
    this.name = 'Hip4Error';
    this.raw = raw ?? message;
  }
}

export type OutcomeSideSpec = { name: string };

export type OutcomeMetaRow = {
  outcome: number;
  name: string;
  description: string;
  sideSpecs: OutcomeSideSpec[];
  quoteToken?: string;
  venue?: string;
  deployerFeeScale?: string;
};

export type OutcomeQuestion = {
  question: number;
  name: string;
  description: string;
  fallbackOutcome?: number;
  namedOutcomes: number[];
  settledNamedOutcomes?: number[];
};

export type OutcomeDeployer = {
  deployer: string;
  venue: string;
  subDeployers?: unknown;
};

export type OutcomeMeta = {
  outcomes: OutcomeMetaRow[];
  questions: OutcomeQuestion[];
  deployers: OutcomeDeployer[];
  feeScale?: string;
};

export type OutcomeTemplate = {
  id: string;
  name?: string;
  description?: string;
  role?: unknown;
  keywords?: unknown;
};

export type OutcomeCandle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
};

export type OutcomeCandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export type CandleSample = { t: number; p: number };

export const CANDLE_INTERVAL_MS: Record<OutcomeCandleInterval, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

export const CHART_RANGES: {
  id: OutcomeCandleInterval;
  label: string;
  interval: OutcomeCandleInterval;
}[] = [
  { id: '1m', label: '1m', interval: '1m' },
  { id: '5m', label: '5m', interval: '5m' },
  { id: '15m', label: '15m', interval: '15m' },
  { id: '1h', label: '1H', interval: '1h' },
  { id: '4h', label: '4H', interval: '4h' },
  { id: '1d', label: '1D', interval: '1d' },
];

/** Public tape print — REST recentTrades + WS trades share this shape. */
export type OutcomePrint = {
  id: string;
  coin: string;
  outcomeId: number;
  side: OutcomeSide | null;
  takerSide: 'buy' | 'sell';
  px: number;
  sz: number;
  notional: number;
  time: number;
  users: string[];
};

export type ActiveWallet = {
  address: string;
  volumeUsd: number;
  trades: number;
};

export type ListedSide = {
  side: OutcomeSide;
  name: string;
  coin: string;
  token: string;
  assetId: number;
  probability: number | null;
};

export type ListedMarket = {
  id: string;
  outcomeId: number;
  questionId: number | null;
  /** Question title when this outcome belongs to a multi-leg set. */
  questionName: string | null;
  /** Short name for this leg (e.g. "No change") — not the full event title. */
  legLabel: string;
  /** True when this outcome shares a question with other named outcomes. */
  multiOutcome: boolean;
  title: string;
  subtitle: string;
  venue: string | null;
  quoteToken: string;
  sides: ListedSide[];
  expiresAt: number | null;
  /** Distinct kickoff / decision time when metadata has both `time` and `expiry`. */
  startsAt: number | null;
  status: MarketStatus;
  isSports: boolean;
  templateId: string | null;
  /** 24h notional USD from HL `dayNtlVlm` (Yes/No books). */
  volumeUsd: number;
  raw: OutcomeMetaRow;
};

export type OutcomePosition = {
  outcomeId: number;
  side: OutcomeSide;
  coin: string;
  shares: number;
  title: string;
  sideName: string;
  probability: number | null;
  valueUsd: number;
  /** Size-weighted cost from HL `entryNtl`. */
  costUsd: number | null;
  avgCost: number | null;
  /** Mark − cost. Null when entry notional is missing. */
  pnlUsd: number | null;
  /** `total − hold` — shares not locked on a resting sell. */
  availableShares: number;
  status: MarketStatus;
};

export type UserOutcomeAction =
  | { type: 'userOutcome'; splitOutcome: { outcome: number; amount: string } }
  | { type: 'userOutcome'; mergeOutcome: { outcome: number; amount: string | null } }
  | { type: 'userOutcome'; mergeQuestion: { question: number; amount: string | null } }
  | {
      type: 'userOutcome';
      negateOutcome: { question: number; outcome: number; amount: string };
    };

export type PlaceOutcomeOrderInput = {
  outcomeId: number;
  side: OutcomeSide;
  tradeSide: 'buy' | 'sell';
  sizeUsd: number;
  orderType: 'market' | 'limit';
  limitPx?: number;
  referencePx?: number;
  /** Share count override (e.g. sell-all). */
  sizeShares?: number;
  /** Close leftover inventory the $10 book minimum would otherwise reject. */
  skipMinNotional?: boolean;
};

export type OutcomeOrderResult = {
  status: 'filled' | 'resting' | 'unknown';
  raw: unknown;
  filledShares: number | null;
  avgPx: number | null;
};

export type BookLevel = { px: number; sz: number };

export type OutcomeBook = {
  coin: string;
  bids: BookLevel[];
  asks: BookLevel[];
};

export type FillEstimate = {
  avgPx: number;
  filledShares: number;
  usd: number;
  short: boolean;
};

export type OutcomeOpenOrder = {
  oid: number;
  outcomeId: number;
  side: OutcomeSide;
  tradeSide: 'buy' | 'sell';
  limitPx: number;
  sz: number;
  timestamp: number;
};

/** Resting limit that left the book without a fill (user cancel or market ended). */
export type OutcomeCancelledOrder = {
  kind: 'cancelled';
  oid: number;
  outcomeId: number;
  side: OutcomeSide;
  tradeSide: 'buy' | 'sell';
  limitPx: number;
  sz: number;
  title: string;
  sideName: string;
  /** HL status: `canceled` (user or protocol) or `delistedCanceled` (asset gone). */
  reason: 'canceled' | 'marketEnded';
  cancelledAt: number;
};

const SPORTS_RE =
  /\b(sport|football|soccer|nba|nfl|mlb|nhl|fifa|uefa|match|league|tennis|ufc|mma|esport|premier|bundesliga|laliga|world\s*cup|olympi|cricket|rugby|nascar|f1|formula\s*1)\b/i;

/** HIP-4 books reject orders below this notional, except a full close of leftover shares. */
export const MIN_OUTCOME_NOTIONAL_USD = 10;
const MIN_NOTIONAL_USD = MIN_OUTCOME_NOTIONAL_USD;
/** Market orders pad this far from mid so the IOC limit still fills. */
export const OUTCOME_MARKET_SLIPPAGE = 0.08;
/** Live outcome books quote integer lots (szDecimals = 0). */
const OUTCOME_SZ_DECIMALS = 0;
const OUTCOME_LOT = 10 ** -OUTCOME_SZ_DECIMALS;
const META_TTL_MS = 20_000;
/** Catalog odds — not a perp ticker. HL allMids is still one blob; we keep HIP-4 keys only. */
const MIDS_TTL_MS = 20_000;
const VOLUME_TTL_MS = 45_000;
/** HIP-4 is missing from `spotMetaAndAssetCtxs`; tape fills the gap. */
const TAPE_VOLUME_TTL_MS = 120_000;

/** Home / Markets list. Live ¢ belongs on the ticket BBO, not a 15s full-exchange poll. */
export const HIP4_CATALOG_STALE_MS = 30_000;
export const HIP4_CATALOG_POLL_MS = 45_000;
/** Positions Live tab — `allMids` only, paused when the tab is hidden / empty. */
export const HIP4_POSITIONS_MIDS_POLL_MS = 8_000;

function isOutcomeBookKey(k: string): boolean {
  const c = k.charCodeAt(0);
  if (c !== 35 && c !== 43 && c !== 64) return false; // # + @
  if (k.length < 2) return false;
  const d = k.charCodeAt(1);
  return d >= 48 && d <= 57;
}

let metaCache: { at: number; value: OutcomeMeta } | null = null;
let templatesCache: { at: number; value: OutcomeTemplate[] } | null = null;
let midsCache: { at: number; value: Record<string, string> } | null = null;
let volumeCache: { at: number; value: Record<string, number> } | null = null;
let volumeEnrichInflight: Promise<Record<string, number>> | null = null;
let tapeVolumeCache: { at: number; value: Record<number, number> } | null = null;

/** encoding = 10 * outcomeId + side  →  assetId = 100_000_000 + encoding */
export function outcomeEncoding(outcomeId: number, side: OutcomeSide): number {
  return 10 * outcomeId + side;
}

export function outcomeAssetId(outcomeId: number, side: OutcomeSide): number {
  return 100_000_000 + outcomeEncoding(outcomeId, side);
}

export function outcomeSpotCoin(outcomeId: number, side: OutcomeSide): string {
  return `#${outcomeEncoding(outcomeId, side)}`;
}

export function outcomeTokenName(outcomeId: number, side: OutcomeSide): string {
  return `+${outcomeEncoding(outcomeId, side)}`;
}

/** AMM-level coin used by some info endpoints (`allMids` also keys `#encoding`). */
export function outcomeAmmCoin(outcomeId: number): string {
  return `@${outcomeId}`;
}

/**
 * Empty / one-sided HIP-4 books often print the tick rails (1¢ bid or 99¢ ask).
 * Those are not a tradable mid — a resting 30¢ bid would already have filled a 1¢ ask.
 */
export function isOutcomeRailPx(px: number): boolean {
  return Number.isFinite(px) && (px <= 0.015 || px >= 0.985);
}

export function parseSideCoin(coin: string): { outcomeId: number; side: OutcomeSide } | null {
  const raw = String(coin ?? '').trim();
  const m = /^[# +](\d+)$/.exec(raw);
  if (!m) return null;
  const encoding = Number(m[1]);
  if (!Number.isFinite(encoding) || encoding < 0) return null;
  const side = (encoding % 10) as number;
  if (side !== 0 && side !== 1) return null;
  return { outcomeId: Math.floor(encoding / 10), side: side as OutcomeSide };
}

export function getOutcomeExchangeUrl(): string {
  return getHip4Runtime()?.exchangeUrl() ?? hlExchangeUrl(false);
}

async function hlInfo<T>(body: Record<string, unknown>): Promise<T> {
  const url = getHip4Runtime()?.infoUrl() ?? hlInfoUrl(false);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Hip4Error(`${body.type ?? 'info'} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseOutcomeMeta(raw: unknown): OutcomeMeta {
  const rec = asRecord(raw) ?? {};
  const outcomesIn = Array.isArray(rec.outcomes) ? rec.outcomes : [];
  const questionsIn = Array.isArray(rec.questions) ? rec.questions : [];
  const deployersIn = Array.isArray(rec.deployers) ? rec.deployers : [];

  const outcomes: OutcomeMetaRow[] = outcomesIn.map((row) => {
    const r = asRecord(row) ?? {};
    const sides = Array.isArray(r.sideSpecs) ? r.sideSpecs : [];
    return {
      outcome: asNum(r.outcome) ?? 0,
      name: String(r.name ?? ''),
      description: String(r.description ?? ''),
      sideSpecs: sides.map((s) => ({
        name: String(asRecord(s)?.name ?? 'Side'),
      })),
      quoteToken: r.quoteToken != null ? String(r.quoteToken) : undefined,
      venue: r.venue != null ? String(r.venue) : undefined,
      deployerFeeScale: r.deployerFeeScale != null ? String(r.deployerFeeScale) : undefined,
    };
  });

  const questions: OutcomeQuestion[] = questionsIn.map((row) => {
    const r = asRecord(row) ?? {};
    return {
      question: asNum(r.question) ?? 0,
      name: String(r.name ?? ''),
      description: String(r.description ?? ''),
      fallbackOutcome: asNum(r.fallbackOutcome) ?? undefined,
      namedOutcomes: Array.isArray(r.namedOutcomes)
        ? r.namedOutcomes.map((n) => asNum(n) ?? 0).filter(Boolean)
        : [],
      settledNamedOutcomes: Array.isArray(r.settledNamedOutcomes)
        ? r.settledNamedOutcomes.map((n) => asNum(n) ?? 0).filter(Boolean)
        : [],
    };
  });

  const deployers: OutcomeDeployer[] = deployersIn.map((row) => {
    const r = asRecord(row) ?? {};
    return {
      deployer: String(r.deployer ?? ''),
      venue: String(r.venue ?? ''),
      subDeployers: r.subDeployers,
    };
  });

  return {
    outcomes,
    questions,
    deployers,
    feeScale: rec.feeScale != null ? String(rec.feeScale) : undefined,
  };
}

export async function fetchOutcomeMeta(force = false): Promise<OutcomeMeta> {
  const now = Date.now();
  if (!force && metaCache && now - metaCache.at < META_TTL_MS) return metaCache.value;
  const value = parseOutcomeMeta(await hlInfo<unknown>({ type: 'outcomeMeta' }));
  metaCache = { at: now, value };
  return value;
}

export async function fetchOutcomeTemplates(force = false): Promise<OutcomeTemplate[]> {
  const now = Date.now();
  if (!force && templatesCache && now - templatesCache.at < META_TTL_MS) {
    return templatesCache.value;
  }
  const raw = await hlInfo<unknown>({ type: 'outcomeTemplates' });
  const list = Array.isArray(raw) ? raw : [];
  const value: OutcomeTemplate[] = list.map((row) => {
    const r = asRecord(row) ?? {};
    return {
      id: String(r.id ?? ''),
      name: r.name != null ? String(r.name) : undefined,
      description: r.description != null ? String(r.description) : undefined,
      role: r.role,
      keywords: r.keywords,
    };
  });
  templatesCache = { at: now, value };
  return value;
}

export async function fetchSettledOutcome(outcome: number): Promise<unknown> {
  return hlInfo<unknown>({ type: 'settledOutcome', outcome });
}

const PLACEHOLDER_TITLE_RE =
  /^(Recurring(?: Named Outcome| Fallback)?|Outcome #\d+|Prediction #\d+)$/i;

export function isPlaceholderOutcomeTitle(title: string): boolean {
  return PLACEHOLDER_TITLE_RE.test(title.trim());
}

function hasFilledPriceBinarySpec(description: string): boolean {
  const fields = parsePipeFields(description);
  return (
    fields.class === 'priceBinary' &&
    Boolean(fields.underlying) &&
    Boolean(fields.targetPrice || fields.threshold)
  );
}

/**
 * Protocol recurring shells that never got a human title — e.g. question
 * "Recurring" with legs "Recurring Named Outcome" (HIP-4 daily BTC buckets).
 * Standalone daily binaries named "Recurring" but with a filled price spec
 * still list (they already get a "Will ETH be above $…?" title).
 */
export function isUnlistedPlaceholderOutcome(
  row: OutcomeMetaRow,
  question?: OutcomeQuestion | null,
): boolean {
  const rowName = cleanSideName(row.name);
  if (isPlaceholderOutcomeTitle(rowName)) {
    if (/^recurring$/i.test(rowName) && hasFilledPriceBinarySpec(row.description)) {
      return false;
    }
    return true;
  }
  return Boolean(question && isPlaceholderOutcomeTitle(cleanSideName(question.name)));
}

/**
 * HIP-3 oracles are `dex:ASSET` (`xyz:SNDK`). Show `SNDK` in UI — the dex name is
 * plumbing. Does not change `raw` / settlement. Dex must start with a letter so
 * clock times like `23:59` stay intact.
 */
export function stripHip3DexPrefixForDisplay(text: string): string {
  if (!text) return text;
  return text.replace(/\b[a-z]{2,6}:([A-Za-z][A-Za-z0-9._-]*)/g, '$1');
}

export function displayOracleSymbol(raw: string): string {
  return stripHip3DexPrefixForDisplay(raw.trim());
}

export function displayListedTitle(market: ListedMarket): string {
  const title =
    market.multiOutcome && market.questionName ? market.questionName : market.title;
  return stripHip3DexPrefixForDisplay(title);
}

export type SettledOutcomeLabel = {
  title: string;
  sideNames: Record<0 | 1, string>;
};

const settledLabelCache = new Map<number, { at: number; label: SettledOutcomeLabel }>();
const SETTLED_LABEL_TTL_MS = 15 * 60 * 1000;

function specToMetaRow(spec: Record<string, unknown>, fallbackId: number): OutcomeMetaRow {
  const sides = Array.isArray(spec.sideSpecs) ? spec.sideSpecs : [];
  return {
    outcome: asNum(spec.outcome) ?? fallbackId,
    name: String(spec.name ?? ''),
    description: String(spec.description ?? ''),
    sideSpecs: sides.map((s) => ({
      name: String(asRecord(s)?.name ?? 'Side'),
    })),
    quoteToken: spec.quoteToken != null ? String(spec.quoteToken) : undefined,
    venue: spec.venue != null ? String(spec.venue) : undefined,
  };
}

/** Recurring books leave `outcomeMeta` after settle. `settledOutcome` still has the spec. */
export async function fetchSettledOutcomeLabels(
  outcomeIds: number[],
): Promise<Map<number, SettledOutcomeLabel>> {
  const out = new Map<number, SettledOutcomeLabel>();
  const now = Date.now();
  const need: number[] = [];
  for (const id of [...new Set(outcomeIds)].filter((n) => n > 0)) {
    const hit = settledLabelCache.get(id);
    if (hit && now - hit.at < SETTLED_LABEL_TTL_MS) {
      out.set(id, hit.label);
    } else {
      need.push(id);
    }
  }
  if (!need.length) return out;

  const templates = await fetchOutcomeTemplates().catch(() => [] as OutcomeTemplate[]);
  const chunk = 4;
  for (let i = 0; i < need.length; i += chunk) {
    const slice = need.slice(i, i + chunk);
    await Promise.all(
      slice.map(async (id) => {
        try {
          const raw = await fetchSettledOutcome(id);
          const rec = asRecord(raw);
          const spec = asRecord(rec?.spec) ?? rec;
          if (!spec) return;
          const row = specToMetaRow(spec, id);
          const { title } = titleFromOutcome(row, templates);
          if (!title || isPlaceholderOutcomeTitle(title)) return;
          const sideNames: Record<0 | 1, string> = {
            0: cleanSideName(row.sideSpecs[0]?.name ?? 'Yes'),
            1: cleanSideName(row.sideSpecs[1]?.name ?? 'No'),
          };
          const label = { title, sideNames };
          settledLabelCache.set(id, { at: Date.now(), label });
          out.set(id, label);
        } catch {
          /* keep placeholder */
        }
      }),
    );
  }
  return out;
}

export function outcomeIdsNeedingSettledLabels(
  fills: Array<Record<string, unknown>>,
  markets: ListedMarket[],
  extraCoins: string[] = [],
): number[] {
  const byId = new Map(markets.map((m) => [m.outcomeId, m]));
  const ids = new Set<number>();
  const consider = (coin: string) => {
    const parsed = parseSideCoin(coin);
    if (!parsed) return;
    const market = byId.get(parsed.outcomeId);
    if (!market || isPlaceholderOutcomeTitle(market.title)) ids.add(parsed.outcomeId);
  };
  for (const f of fills) consider(String(f.coin ?? f.token ?? ''));
  for (const coin of extraCoins) consider(coin);
  return [...ids].sort((a, b) => a - b);
}

export function applySettledOutcomeLabels<
  T extends { outcomeId: number; side: OutcomeSide; title: string; sideName: string },
>(rows: T[], labels: Map<number, SettledOutcomeLabel> | undefined): T[] {
  if (!labels?.size) return rows;
  return rows.map((row) => {
    if (row.title && !isPlaceholderOutcomeTitle(row.title)) return row;
    const hit = labels.get(row.outcomeId);
    if (!hit?.title || isPlaceholderOutcomeTitle(hit.title)) return row;
    return {
      ...row,
      title: hit.title,
      sideName: hit.sideNames[row.side] ?? row.sideName,
    };
  });
}

function parseSpotDayNtlByCoin(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(raw) || raw.length < 2) return out;
  const meta = asRecord(raw[0]) ?? {};
  const universe = Array.isArray(meta.universe) ? meta.universe : [];
  const tokens = Array.isArray(meta.tokens) ? meta.tokens : [];
  const ctxs = Array.isArray(raw[1]) ? raw[1] : [];

  const tokenNameByIndex = new Map<number, string>();
  for (let i = 0; i < tokens.length; i++) {
    const t = asRecord(tokens[i]);
    if (!t) continue;
    const idx = asNum(t.index) ?? i;
    const name = String(t.name ?? '');
    if (name) tokenNameByIndex.set(idx, name);
  }

  for (let i = 0; i < ctxs.length; i++) {
    const ctx = asRecord(ctxs[i]);
    if (!ctx) continue;
    const vlm = asNum(ctx.dayNtlVlm);
    if (vlm == null || vlm < 0) continue;
    const uni = asRecord(universe[i]);
    const names = [
      typeof ctx.coin === 'string' ? ctx.coin : '',
      String(uni?.name ?? ''),
    ];
    const tokenIdxs = Array.isArray(uni?.tokens) ? uni.tokens : [];
    const baseIdx = asNum(tokenIdxs[0]);
    if (baseIdx != null) names.push(tokenNameByIndex.get(baseIdx) ?? '');
    for (const name of names) {
      if (name && isOutcomeBookKey(name)) out[name] = vlm;
    }
  }
  return out;
}

async function fetchSpotDayNtlByCoin(force = false): Promise<Record<string, number>> {
  const now = Date.now();
  if (!force && volumeCache && now - volumeCache.at < VOLUME_TTL_MS) return volumeCache.value;
  try {
    const raw = await hlInfo<unknown>({ type: 'spotMetaAndAssetCtxs' });
    const value = parseSpotDayNtlByCoin(raw);
    volumeCache = { at: now, value };
    return value;
  } catch {
    return volumeCache?.value ?? {};
  }
}

function dayVolumeUsd(byCoin: Record<string, number>, outcomeId: number): number {
  const yes =
    byCoin[outcomeSpotCoin(outcomeId, 0)] ?? byCoin[outcomeTokenName(outcomeId, 0)] ?? 0;
  const no =
    byCoin[outcomeSpotCoin(outcomeId, 1)] ?? byCoin[outcomeTokenName(outcomeId, 1)] ?? 0;
  if (yes > 0 && no > 0) return Math.max(yes, no);
  return yes + no;
}

async function tapeNotionalUsd(outcomeId: number): Promise<number> {
  try {
    const raw = await hlInfo<unknown>({
      type: 'recentTrades',
      coin: outcomeSpotCoin(outcomeId, 0),
    });
    const rows = Array.isArray(raw) ? raw : [];
    let ntl = 0;
    for (const row of rows) {
      const print = parseOutcomeTrade(row);
      if (!print || (print.outcomeId !== -1 && print.outcomeId !== outcomeId)) continue;
      ntl += print.notional;
    }
    return ntl;
  } catch {
    return 0;
  }
}

function applyTapeVolumes(
  byCoin: Record<string, number>,
  missing: number[],
  tape: Record<number, number>,
): Record<string, number> {
  const next = { ...byCoin };
  let changed = false;
  for (const id of missing) {
    const ntl = tape[id] ?? 0;
    if (ntl <= 0.5) continue;
    const key = outcomeSpotCoin(id, 0);
    if (next[key] !== ntl) {
      next[key] = ntl;
      changed = true;
    }
  }
  return changed ? next : byCoin;
}

async function ensureOutcomeVolumes(
  byCoin: Record<string, number>,
  outcomeIds: number[],
): Promise<Record<string, number>> {
  const ids = outcomeIds.filter((id) => id > 0);
  const missing = ids.filter((id) => dayVolumeUsd(byCoin, id) <= 0);
  if (!missing.length) return byCoin;

  const now = Date.now();
  const tapeFresh =
    tapeVolumeCache && now - tapeVolumeCache.at < TAPE_VOLUME_TTL_MS ? tapeVolumeCache.value : null;
  const needTape = missing.filter((id) => tapeFresh?.[id] == null);
  if (!needTape.length && tapeFresh) {
    const merged = applyTapeVolumes(byCoin, missing, tapeFresh);
    if (merged !== byCoin) volumeCache = { at: now, value: merged };
    return merged;
  }
  if (volumeEnrichInflight) return volumeEnrichInflight;

  volumeEnrichInflight = (async () => {
    const nextTape: Record<number, number> = { ...(tapeFresh ?? {}) };
    const chunk = 6;
    for (let i = 0; i < needTape.length; i += chunk) {
      const slice = needTape.slice(i, i + chunk);
      await Promise.all(
        slice.map(async (id) => {
          nextTape[id] = await tapeNotionalUsd(id);
        }),
      );
    }
    tapeVolumeCache = { at: Date.now(), value: nextTape };
    const next = applyTapeVolumes(byCoin, missing, nextTape);
    volumeCache = { at: Date.now(), value: next };
    return next;
  })();

  try {
    return await volumeEnrichInflight;
  } finally {
    volumeEnrichInflight = null;
  }
}

/**
 * HIP-4 mids only (`#encoding` / `+encoding` / `@outcome`).
 * HL has no coin filter on `allMids` — drop ETH/BTC/HIP-3 keys immediately.
 */
export async function fetchAllMids(force = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!force && midsCache && now - midsCache.at < MIDS_TTL_MS) return midsCache.value;
  const raw = await hlInfo<unknown>({ type: 'allMids' });
  const rec = asRecord(raw);
  const src = rec && rec.mids && typeof rec.mids === 'object' ? asRecord(rec.mids) : rec;
  const value: Record<string, string> = {};
  if (src) {
    for (const [k, v] of Object.entries(src)) {
      if (!isOutcomeBookKey(k)) continue;
      if (typeof v === 'string' || typeof v === 'number') value[k] = String(v);
    }
  }
  midsCache = { at: now, value };
  return value;
}

export function parseOutcomeTrade(raw: unknown): OutcomePrint | null {
  const r = asRecord(raw);
  if (!r) return null;
  const coin = String(r.coin ?? '');
  if (coin.charCodeAt(0) !== 35 && coin.charCodeAt(0) !== 43) return null;
  const parsed = parseSideCoin(coin);
  const px = asNum(r.px);
  const sz = asNum(r.sz);
  const time = asNum(r.time) ?? Date.now();
  if (px == null || sz == null || px <= 0 || sz <= 0) return null;
  const sideFlag = String(r.side ?? '').toUpperCase();
  const usersRaw = Array.isArray(r.users) ? r.users : [];
  const users = usersRaw
    .map((u) => String(u ?? '').toLowerCase())
    .filter((u) => /^0x[a-f0-9]{40}$/.test(u));
  const tid = asNum(r.tid);
  const hash = typeof r.hash === 'string' ? r.hash : '';
  return {
    id: tid != null ? `${tid}:${hash || coin}` : `${time}:${coin}:${px}:${sz}`,
    coin,
    outcomeId: parsed?.outcomeId ?? -1,
    side: parsed?.side ?? null,
    takerSide: sideFlag === 'A' ? 'sell' : 'buy',
    px,
    sz,
    notional: px * sz,
    time,
    users,
  };
}

export async function fetchOutcomeRecentTrades(outcomeId: number): Promise<OutcomePrint[]> {
  const coins = [outcomeSpotCoin(outcomeId, 0), outcomeSpotCoin(outcomeId, 1)];
  const batches = await Promise.all(
    coins.map(async (coin) => {
      try {
        const raw = await hlInfo<unknown>({ type: 'recentTrades', coin });
        return Array.isArray(raw) ? raw : [];
      } catch {
        return [];
      }
    }),
  );
  const byId = new Map<string, OutcomePrint>();
  for (const row of batches.flat()) {
    const print = parseOutcomeTrade(row);
    if (!print || (print.outcomeId !== -1 && print.outcomeId !== outcomeId)) continue;
    byId.set(print.id, print);
  }
  return [...byId.values()].sort((a, b) => b.time - a.time);
}

function parseBookLevels(raw: unknown): BookLevel[] {
  if (!Array.isArray(raw)) return [];
  const out: BookLevel[] = [];
  for (const row of raw) {
    const rec = asRecord(row);
    const px = asNum(rec?.px);
    const sz = asNum(rec?.sz);
    if (px == null || sz == null || !(px > 0) || !(sz > 0)) continue;
    out.push({ px, sz });
  }
  return out;
}

/** REST `l2Book` — HIP-4 coins are `#encoding`. levels[0] bids, levels[1] asks. */
export async function fetchOutcomeBook(
  outcomeId: number,
  side: OutcomeSide,
): Promise<OutcomeBook> {
  const coin = outcomeSpotCoin(outcomeId, side);
  const raw = await hlInfo<{ coin?: string; levels?: unknown }>({ type: 'l2Book', coin });
  const levels = Array.isArray(raw.levels) ? raw.levels : [];
  const bids = parseBookLevels(levels[0]).sort((a, b) => b.px - a.px);
  const asks = parseBookLevels(levels[1]).sort((a, b) => a.px - b.px);
  return { coin, bids, asks };
}

/** Walk the book the way a market order fills: buy takes asks, sell takes bids. */
export function estimateBookFill(
  book: OutcomeBook | null | undefined,
  tradeSide: 'buy' | 'sell',
  shares: number,
): FillEstimate | null {
  if (!book || !(shares > 0)) return null;
  const levels = tradeSide === 'buy' ? book.asks : book.bids;
  if (!levels.length) return null;
  let left = shares;
  let cost = 0;
  let filled = 0;
  for (const lvl of levels) {
    const take = Math.min(left, lvl.sz);
    if (!(take > 0)) continue;
    cost += take * lvl.px;
    filled += take;
    left -= take;
    if (left <= 1e-9) break;
  }
  if (!(filled > 0)) return null;
  return {
    avgPx: cost / filled,
    filledShares: filled,
    usd: cost,
    short: left > 0.5,
  };
}

/** Spend `usd` walking the ask — payout if those shares settle at $1. */
export function estimateUsdBuy(
  book: OutcomeBook | null | undefined,
  usd: number,
): FillEstimate | null {
  if (!book || !(usd > 0)) return null;
  let left = usd;
  let filled = 0;
  let cost = 0;
  for (const lvl of book.asks) {
    if (!(lvl.px > 0) || !(lvl.sz > 0)) continue;
    const take = Math.min(lvl.sz, left / lvl.px);
    if (!(take > 0)) continue;
    filled += take;
    cost += take * lvl.px;
    left -= take * lvl.px;
    if (left <= 1e-6) break;
  }
  if (!(filled > 0) || !(cost > 0)) return null;
  return {
    avgPx: cost / filled,
    filledShares: filled,
    usd: cost,
    short: left > 0.05,
  };
}

export type BuyPayoutEstimate = {
  shares: number;
  avgPx: number;
  toWinUsd: number;
  short: boolean;
};

/**
 * Live “To win” as the user types a buy size. Winning HIP-4 shares pay $1,
 * so payout ≈ shares. Uses the ask book when present; otherwise limit/mid.
 * Does not bump size to the $10 min — that would lie while they type.
 */
export function estimateBuyPayout(opts: {
  usd: number;
  book?: OutcomeBook | null;
  limitPx?: number | null;
  fallbackPx?: number | null;
}): BuyPayoutEstimate | null {
  const usd = opts.usd;
  if (!Number.isFinite(usd) || !(usd > 0)) return null;

  const limitPx = opts.limitPx;
  if (limitPx != null && Number.isFinite(limitPx) && limitPx > 0) {
    const shares = usd / limitPx;
    if (!(shares > 0)) return null;
    return { shares, avgPx: limitPx, toWinUsd: shares, short: false };
  }

  const walked = estimateUsdBuy(opts.book, usd);
  if (walked) {
    return {
      shares: walked.filledShares,
      avgPx: walked.avgPx,
      toWinUsd: walked.filledShares,
      short: walked.short,
    };
  }

  const fallbackPx = opts.fallbackPx;
  if (fallbackPx != null && Number.isFinite(fallbackPx) && fallbackPx > 0) {
    const shares = usd / fallbackPx;
    if (!(shares > 0)) return null;
    return { shares, avgPx: fallbackPx, toWinUsd: shares, short: false };
  }
  return null;
}

/**
 * Live proceeds as the user types a sell size. Walks the bid book for market
 * sells; limit uses size × price. Same shape as {@link estimateBuyPayout} so
 * the ticket can share the To win / You'll get block.
 */
export function estimateSellPayout(opts: {
  shares: number;
  book?: OutcomeBook | null;
  limitPx?: number | null;
  fallbackPx?: number | null;
}): BuyPayoutEstimate | null {
  const shares = opts.shares;
  if (!Number.isFinite(shares) || !(shares > 0)) return null;

  const limitPx = opts.limitPx;
  if (limitPx != null && Number.isFinite(limitPx) && limitPx > 0) {
    return { shares, avgPx: limitPx, toWinUsd: shares * limitPx, short: false };
  }

  const walked = estimateBookFill(opts.book, 'sell', shares);
  if (walked) {
    return {
      shares: walked.filledShares,
      avgPx: walked.avgPx,
      toWinUsd: walked.usd,
      short: walked.short,
    };
  }

  const fallbackPx = opts.fallbackPx;
  if (fallbackPx != null && Number.isFinite(fallbackPx) && fallbackPx > 0) {
    return { shares, avgPx: fallbackPx, toWinUsd: shares * fallbackPx, short: false };
  }
  return null;
}

/** Ticket cents: 0.2¢ stays one decimal; 42¢ is an integer. */
export function formatOutcomeCents(px: number): string {
  const c = px * 100;
  if (!Number.isFinite(c) || !(c > 0)) return '0';
  if (c < 10) return c.toFixed(1);
  return Math.abs(c - Math.round(c)) < 0.05 ? String(Math.round(c)) : c.toFixed(1);
}

export async function fetchOutcomeOpenOrders(user: Hex): Promise<OutcomeOpenOrder[]> {
  const raw = await hlInfo<unknown>({ type: 'frontendOpenOrders', user });
  const rows = Array.isArray(raw) ? raw : [];
  const out: OutcomeOpenOrder[] = [];
  for (const row of rows) {
    const rec = asRecord(row);
    const coin = String(rec?.coin ?? '');
    const parsed = parseSideCoin(coin);
    if (!parsed) continue;
    const oid = asNum(rec?.oid);
    const limitPx = asNum(rec?.limitPx);
    const sz = asNum(rec?.sz);
    if (oid == null || limitPx == null || sz == null || !(sz > 0)) continue;
    const sideFlag = String(rec?.side ?? '').toUpperCase();
    out.push({
      oid,
      outcomeId: parsed.outcomeId,
      side: parsed.side,
      tradeSide: sideFlag === 'A' ? 'sell' : 'buy',
      limitPx,
      sz,
      timestamp: asNum(rec?.timestamp) ?? 0,
    });
  }
  return out.sort((a, b) => b.timestamp - a.timestamp);
}

/** User-cancel, settlement auto-cancel, delist, etc. — not fills, not rejects. */
function isRestingCancelStatus(status: string): boolean {
  const s = status.trim();
  if (!s || /rejected$/i.test(s)) return false;
  return /^canceled$/i.test(s) || /Canceled$/i.test(s) || /^cancelled$/i.test(s);
}

function cancelReasonFromStatus(status: string): OutcomeCancelledOrder['reason'] {
  return /delistedCanceled/i.test(status) ? 'marketEnded' : 'canceled';
}

/** Keep this many cancelled HIP-4 limits in History — not the whole HL dump. */
const OUTCOME_CANCEL_HISTORY_CAP = 50;

function isOutcomeCoinName(coin: string): boolean {
  const c = coin.charCodeAt(0);
  return c === 35 || c === 43; // `#encoding` / `+encoding`
}

/**
 * This wallet's cancelled HIP-4 limits only.
 *
 * HL `historicalOrders` has no coin/limit param — it always returns up to 2000
 * of *this user's* recent orders across perps, spot, and outcomes. We discard
 * everything that is not an outcome `#`/`+` coin and keep the newest 50 cancels.
 * https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
 */
export async function fetchOutcomeCancelledOrders(user: Hex): Promise<OutcomeCancelledOrder[]> {
  const raw = await hlInfo<unknown>({ type: 'historicalOrders', user });
  const rec = asRecord(raw);
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray(rec?.orders)
      ? rec.orders
      : Array.isArray(rec?.data)
        ? rec.data
        : [];
  const out: OutcomeCancelledOrder[] = [];
  for (const row of rows) {
    const wrap = asRecord(row);
    const status = String(wrap?.status ?? '');
    if (!isRestingCancelStatus(status)) continue;
    const order = asRecord(wrap?.order) ?? wrap;
    if (!order) continue;
    const coin = String(order.coin ?? '');
    if (!isOutcomeCoinName(coin)) continue;
    const parsed = parseSideCoin(coin);
    if (!parsed) continue;
    const oid = asNum(order.oid);
    const limitPx = asNum(order.limitPx);
    const origSz = asNum(order.origSz);
    const sz = asNum(order.sz);
    const shares = origSz != null && origSz > 0 ? origSz : sz;
    if (oid == null || limitPx == null || shares == null || !(shares > 0)) continue;
    const sideFlag = String(order.side ?? '').toUpperCase();
    out.push({
      kind: 'cancelled',
      oid,
      outcomeId: parsed.outcomeId,
      side: parsed.side,
      tradeSide: sideFlag === 'A' ? 'sell' : 'buy',
      limitPx,
      sz: shares,
      title: `Prediction #${parsed.outcomeId}`,
      sideName: parsed.side === 0 ? 'Yes' : 'No',
      reason: cancelReasonFromStatus(status),
      cancelledAt: asNum(wrap?.statusTimestamp) ?? asNum(order.timestamp) ?? 0,
    });
  }
  return out.sort((a, b) => b.cancelledAt - a.cancelledAt).slice(0, OUTCOME_CANCEL_HISTORY_CAP);
}

export async function cancelOutcomeOrder(order: {
  oid: number;
  outcomeId: number;
  side: OutcomeSide;
}): Promise<void> {
  await cancelOutcomeOrders([order]);
}

export async function cancelOutcomeOrders(
  orders: Array<{ oid: number; outcomeId: number; side: OutcomeSide }>,
): Promise<void> {
  if (!orders.length) return;
  const exchange = await agentExchange();
  await exchange.cancel({
    cancels: orders.map((order) => ({
      a: outcomeAssetId(order.outcomeId, order.side),
      o: order.oid,
    })),
  });
}

function sharesForSide(
  balances: Array<Record<string, unknown>>,
  outcomeId: number,
  side: OutcomeSide,
): number {
  let n = 0;
  for (const b of balances) {
    const parsed = parseSideCoin(String(b.coin ?? b.token ?? ''));
    if (!parsed || parsed.outcomeId !== outcomeId || parsed.side !== side) continue;
    const total = asNum(b.total) ?? 0;
    if (total > 0) n += total;
  }
  return n;
}

/** Shares that can be sold now (not locked on a resting order). */
export function outcomeFreeShares(
  balances: Array<Record<string, unknown>>,
  outcomeId: number,
  side: OutcomeSide,
): number {
  let free = 0;
  for (const b of balances) {
    const parsed = parseSideCoin(String(b.coin ?? b.token ?? ''));
    if (!parsed || parsed.outcomeId !== outcomeId || parsed.side !== side) continue;
    const total = asNum(b.total) ?? 0;
    const hold = asNum(b.hold) ?? 0;
    const avail = total - hold;
    if (avail > 0) free += avail;
  }
  return free;
}

/** Yes+No of one prediction can be merged back to USDC (docs: mergeOutcome). */
export function pairedRedeemShares(
  balances: Array<Record<string, unknown>>,
  outcomeId: number,
): number {
  const yes = sharesForSide(balances, outcomeId, 0);
  const no = sharesForSide(balances, outcomeId, 1);
  return Math.floor(Math.min(yes, no));
}

/** Full Yes bundle across a question can be merged to USDC (docs: mergeQuestion). */
export function questionRedeemShares(
  balances: Array<Record<string, unknown>>,
  outcomeIds: number[],
): number {
  const ids = [...new Set(outcomeIds.filter((id) => Number.isFinite(id) && id >= 0))];
  if (ids.length < 2) return 0;
  let min = Infinity;
  for (const id of ids) {
    const yes = Math.floor(sharesForSide(balances, id, 0));
    min = Math.min(min, yes);
  }
  return Number.isFinite(min) && min >= 1 ? min : 0;
}

export async function redeemOutcomePair(outcomeId: number): Promise<void> {
  await sendUserOutcome({
    type: 'userOutcome',
    mergeOutcome: { outcome: outcomeId, amount: null },
  });
}

export async function redeemQuestionBundle(questionId: number): Promise<void> {
  await sendUserOutcome({
    type: 'userOutcome',
    mergeQuestion: { question: questionId, amount: null },
  });
}

export function rankActiveWallets(prints: OutcomePrint[], limit = 10): ActiveWallet[] {
  const byAddr = new Map<string, ActiveWallet>();
  for (const p of prints) {
    const seen = new Set<string>();
    for (const address of p.users) {
      if (seen.has(address)) continue;
      seen.add(address);
      const cur = byAddr.get(address) ?? { address, volumeUsd: 0, trades: 0 };
      cur.volumeUsd += p.notional;
      cur.trades += 1;
      byAddr.set(address, cur);
    }
  }
  return [...byAddr.values()].sort((a, b) => b.volumeUsd - a.volumeUsd).slice(0, limit);
}

/** Highest 24h book volume first. One row per question so a 5-leg set cannot fill the list. */
export function topMarketsByVolume(markets: ListedMarket[], limit = 3): ListedMarket[] {
  const sorted = [...markets]
    .filter((m) => m.status !== 'settled')
    .sort((a, b) => {
      const dv = b.volumeUsd - a.volumeUsd;
      if (dv !== 0) return dv;
      return a.title.localeCompare(b.title);
    });
  const out: ListedMarket[] = [];
  const seenQuestion = new Set<number>();
  for (const m of sorted) {
    if (m.questionId != null) {
      if (seenQuestion.has(m.questionId)) continue;
      seenQuestion.add(m.questionId);
    }
    out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}

export function shortWallet(address: string): string {
  const a = address.trim();
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function formatUsdCompactPublic(n: number): string {
  return formatUsdCompact(n);
}

/** Home highlight metrics — $12.4K / $1.2M. */
export function formatHighlightVolume(n: number): string {
  if (!Number.isFinite(n) || n < 0.5) return '—';
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m >= 10 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (n >= 1000) {
    const k = n / 1000;
    return `$${k >= 10 ? k.toFixed(1) : k.toFixed(1)}K`;
  }
  return `$${Math.round(n)}`;
}

/** Card meta amount — `$24K` / `$1.2M`. Prefix with i18n `hip4.row.volume`. */
export function formatMarketVolumeAmount(n: number): string {
  if (!Number.isFinite(n) || n < 0.5) return '';
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m >= 10 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  return `$${formatUsdCompact(n)}`;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * HIP-4 `description` is deployer metadata (`class:priceBinary|underlying:BTC|…`),
 * not copy. Turn it into rules the user can read.
 */
export function marketRulesFacts(
  market: ListedMarket,
  multiLeg: boolean,
  t: Translate,
): {
  body: string;
  facts: string[];
} {
  const f = parsePipeFields(market.raw.description);
  const expiry = market.expiresAt ? formatWhen(market.expiresAt) : null;

  let body = multiLeg ? t('hip4.rules.multi') : t('hip4.rules.yesNo');

  if (f.class === 'priceBinary' && f.underlying) {
    const strike = Number(f.targetPrice ?? f.threshold ?? f.target);
    const strikeBit =
      Number.isFinite(strike) && strike > 0
        ? t('hip4.rules.strikeAmount', { amount: formatUsdCompact(strike) })
        : t('hip4.rules.strikeGeneric');
    body = t('hip4.rules.priceBinary', {
      underlying: displayOracleSymbol(f.underlying),
      strike: strikeBit,
    });
  } else if (f.class === 'priceBucket' && f.underlying) {
    body = t('hip4.rules.priceBucket', { underlying: displayOracleSymbol(f.underlying) });
  }

  const facts: string[] = [];
  if (f.underlying) facts.push(t('hip4.rules.underlying', { name: displayOracleSymbol(f.underlying) }));
  if (f.period) facts.push(t('hip4.rules.cadence', { period: f.period }));
  if (expiry) facts.push(t('hip4.rules.resolves', { when: expiry }));
  if (market.questionName) facts.push(t('hip4.rules.question', { name: market.questionName }));
  facts.push(t('hip4.rules.minSize'));
  facts.push(t('hip4.rules.fee'));
  facts.push(t('hip4.rules.settle'));
  return { body, facts };
}

/** Every listed prediction on this question, including fallback if it is in the catalog. */
export function questionOutcomeIds(all: ListedMarket[], market: ListedMarket): number[] {
  if (market.questionId == null) return [market.outcomeId];
  const ids = all.filter((m) => m.questionId === market.questionId).map((m) => m.outcomeId);
  return [...new Set(ids.length ? ids : [market.outcomeId])];
}

/** Named outcomes that share a HIP-4 question (FOMC No change / Increase / Decrease). */
export function questionSiblings(all: ListedMarket[], market: ListedMarket): ListedMarket[] {
  if (market.questionId == null) return [market];
  const sibs = all.filter((m) => m.questionId === market.questionId);
  const named = sibs.filter((m) => !/fallback/i.test(m.raw.name) && !/fallback/i.test(m.legLabel));
  const use = named.length > 1 ? named : sibs;
  return use.length > 1 ? use : [market];
}

export function parsePipeFields(description: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!description) return out;
  for (const part of description.split('|')) {
    const i = part.indexOf(':');
    if (i <= 0) continue;
    out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

/** `YYYYMMDD-HHMM` (UTC) used in outcome descriptions. */
export function parseOutcomeDateTime(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const t = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  );
  return Number.isFinite(t) ? t : null;
}

function formatUsdCompact(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n) >= 1000) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function humanizeKey(name: string): string {
  const stripped = name.replace(/^template:/i, '').trim();
  if (!stripped) return name;
  const spaced = stripped.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function cleanSideName(name: string): string {
  return humanizeKey(name);
}

function templateIdFromName(name: string): string | null {
  if (name.startsWith('template:')) return name.slice('template:'.length);
  return null;
}

function fillTemplate(pattern: string, fields: Record<string, string>): string {
  return pattern.replace(/\{(\w+)\}/g, (_, key: string) => fields[key] ?? `{${key}}`);
}

function displayTitlePair(title: string, subtitle: string): { title: string; subtitle: string } {
  return {
    title: stripHip3DexPrefixForDisplay(title),
    subtitle: stripHip3DexPrefixForDisplay(subtitle),
  };
}

export function titleFromOutcome(
  row: OutcomeMetaRow,
  templates: OutcomeTemplate[],
  question?: OutcomeQuestion | null,
): { title: string; subtitle: string } {
  const fields = parsePipeFields(row.description);
  const tid = templateIdFromName(row.name);
  const tmpl = tid ? templates.find((t) => t.id === tid) : undefined;
  const expiry = parseOutcomeDateTime(fields.expiry ?? fields.time ?? fields.scheduledDecision);

  if (tmpl?.name && /\{/.test(tmpl.name)) {
    const title = fillTemplate(tmpl.name, {
      ...fields,
      perp: displayOracleSymbol(fields.perp ?? fields.underlying ?? ''),
      underlying: displayOracleSymbol(fields.underlying ?? fields.perp ?? ''),
      threshold: fields.threshold ?? fields.targetPrice ?? fields.target ?? '',
      time: expiry ? formatWhen(expiry) : (fields.time ?? ''),
    }).replace(/\s+\?/g, '?');
    return displayTitlePair(
      title,
      question?.name ? cleanSideName(question.name) : expiry ? formatWhen(expiry) : '',
    );
  }

  if (fields.class === 'priceBinary' && fields.underlying && (fields.targetPrice || fields.threshold)) {
    const px = Number(fields.targetPrice ?? fields.threshold);
    const when = expiry ? ` by ${formatWhen(expiry)}` : '';
    return displayTitlePair(
      `Will ${displayOracleSymbol(fields.underlying)} be above $${formatUsdCompact(px)}${when}?`,
      fields.period ? `Recurring · ${fields.period}` : 'Price binary',
    );
  }

  if (question) {
    const qf = parsePipeFields(question.description);
    if (qf.class === 'priceBucket' && qf.underlying && qf.priceThresholds) {
      const cuts = qf.priceThresholds.split(',').map((x) => Number(x.trim())).filter(Number.isFinite);
      const idx = Number(fields.index);
      const qExpiry = parseOutcomeDateTime(qf.expiry) ?? expiry;
      const when = qExpiry ? ` by ${formatWhen(qExpiry)}` : '';
      const u = displayOracleSymbol(qf.underlying);
      let title = `${u} price bucket`;
      if (Number.isFinite(idx) && cuts.length >= 1) {
        if (idx === 0) title = `Will ${u} finish below $${formatUsdCompact(cuts[0])}${when}?`;
        else if (idx === cuts.length) title = `Will ${u} finish above $${formatUsdCompact(cuts[cuts.length - 1])}${when}?`;
        else title = `Will ${u} finish between $${formatUsdCompact(cuts[idx - 1])} and $${formatUsdCompact(cuts[idx])}${when}?`;
      } else if (row.name.toLowerCase().includes('fallback')) {
        title = `${u} bucket fallback`;
      }
      return displayTitlePair(title, 'Price bucket');
    }
    if (qf.institution && qf.policyMeasure) {
      return displayTitlePair(
        `${qf.institution}: ${cleanSideName(row.name) || qf.policyMeasure}`,
        qf.decisionLabel || 'Policy question',
      );
    }
  }

  if (fields.class === 'priceBucket' && fields.underlying) {
    return displayTitlePair(
      `${displayOracleSymbol(fields.underlying)} price bucket`,
      expiry ? formatWhen(expiry) : row.description.slice(0, 80),
    );
  }

  if (fields.underlying && (fields.targetPrice || fields.threshold || fields.target)) {
    const px = Number(fields.targetPrice ?? fields.threshold ?? fields.target);
    return displayTitlePair(
      `${displayOracleSymbol(fields.underlying)} above $${formatUsdCompact(px)}?`,
      expiry ? formatWhen(expiry) : '',
    );
  }

  const fallback = cleanSideName(row.name);
  const desc = row.description.replace(/metadata=.*$/, '').trim();
  return displayTitlePair(
    fallback && fallback !== 'Recurring' ? fallback : desc || `Prediction #${row.outcome}`,
    question ? cleanSideName(question.name) : expiry ? formatWhen(expiry) : '',
  );
}

function expiryFromRow(row: OutcomeMetaRow, question?: OutcomeQuestion | null): number | null {
  const fields = parsePipeFields(row.description);
  const fromRow = parseOutcomeDateTime(
    fields.expiry ?? fields.time ?? fields.scheduledDecision ?? fields.decisionDeadline,
  );
  if (fromRow) return fromRow;
  if (question) {
    const qf = parsePipeFields(question.description);
    return parseOutcomeDateTime(qf.expiry ?? qf.time ?? qf.scheduledDecision ?? qf.decisionDeadline);
  }
  return null;
}

function startFromRow(
  row: OutcomeMetaRow,
  question: OutcomeQuestion | null | undefined,
  expiry: number | null,
): number | null {
  const fields = parsePipeFields(row.description);
  let start = parseOutcomeDateTime(fields.time ?? fields.scheduledDecision);
  if (start == null && question) {
    const qf = parsePipeFields(question.description);
    start = parseOutcomeDateTime(qf.time ?? qf.scheduledDecision);
  }
  if (start == null || expiry == null) return null;
  if (start >= expiry - 60_000) return null;
  return start;
}

function statusFromTimes(
  expiresAt: number | null,
  startsAt: number | null,
  settled: boolean,
): MarketStatus {
  if (settled) return 'settled';
  const now = Date.now();
  if (expiresAt != null && expiresAt <= now) return 'settled';
  if (startsAt != null && startsAt > now) return 'upcoming';
  return 'live';
}

export function isSportsMarket(
  row: OutcomeMetaRow,
  templates: OutcomeTemplate[],
  question?: OutcomeQuestion | null,
): boolean {
  const tid = templateIdFromName(row.name);
  const tmpl = tid ? templates.find((t) => t.id === tid) : undefined;
  const blob = [
    row.name,
    row.description,
    row.venue,
    question?.name,
    question?.description,
    tmpl?.name,
    tmpl?.description,
  ]
    .filter(Boolean)
    .join(' ');
  if (/category:sports|subCategory:sports/i.test(blob)) return true;
  return SPORTS_RE.test(blob);
}

function midFor(mids: Record<string, string>, coin: string): number | null {
  const v = mids[coin];
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function clampProb(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.min(0.9999, Math.max(0.0001, n));
}

/** Patch catalog mids without refetching outcomeMeta / volume. */
export function overlayListedMids(
  markets: ListedMarket[],
  mids: Record<string, string> | undefined,
): ListedMarket[] {
  if (!markets.length || !mids) return markets;
  let changed = false;
  const next = markets.map((m) => {
    let sideChanged = false;
    const sides = m.sides.map((s) => {
      const px = clampProb(midFor(mids, s.coin));
      if (px == null || px === s.probability) return s;
      sideChanged = true;
      return { ...s, probability: px };
    });
    if (!sideChanged) return m;
    changed = true;
    const yes = sides[0]?.probability;
    const no = sides[1]?.probability;
    if (yes != null && sides[1] && no == null) {
      sides[1] = { ...sides[1], probability: clampProb(1 - yes) };
    }
    if (no != null && sides[0] && yes == null) {
      sides[0] = { ...sides[0], probability: clampProb(1 - no) };
    }
    return { ...m, sides };
  });
  return changed ? next : markets;
}

/** HIP-4 catalog: `outcomeMeta` + outcome mids/volume. No perp book. */
export async function listOutcomes(opts?: {
  filter?: OutcomeFilter;
  force?: boolean;
}): Promise<ListedMarket[]> {
  const filter = opts?.filter ?? 'all';
  const [meta, templates, mids, spotVol] = await Promise.all([
    fetchOutcomeMeta(opts?.force),
    fetchOutcomeTemplates(opts?.force).catch(() => [] as OutcomeTemplate[]),
    fetchAllMids(opts?.force).catch(() => ({} as Record<string, string>)),
    fetchSpotDayNtlByCoin(opts?.force).catch(() => ({} as Record<string, number>)),
  ]);
  const outcomeIds = meta.outcomes.map((row) => row.outcome).filter((id) => id > 0);
  const volByCoin = await ensureOutcomeVolumes(spotVol, outcomeIds);

  const questionByOutcome = new Map<number, OutcomeQuestion>();
  const settledOutcomes = new Set<number>();
  for (const q of meta.questions) {
    for (const id of q.namedOutcomes) questionByOutcome.set(id, q);
    if (q.fallbackOutcome) questionByOutcome.set(q.fallbackOutcome, q);
    for (const id of q.settledNamedOutcomes ?? []) settledOutcomes.add(id);
  }

  const listed: ListedMarket[] = [];
  for (const row of meta.outcomes) {
    if (!row.outcome) continue;
    const question = questionByOutcome.get(row.outcome) ?? null;
    if (isUnlistedPlaceholderOutcome(row, question)) continue;
    const { title, subtitle } = titleFromOutcome(row, templates, question);
    const expiresAt = expiryFromRow(row, question);
    const startsAt = startFromRow(row, question, expiresAt);
    const settled = settledOutcomes.has(row.outcome);
    const sides: ListedSide[] = [0, 1].map((side) => {
      const s = side as OutcomeSide;
      const spec = row.sideSpecs[s] ?? row.sideSpecs[0];
      const coin = outcomeSpotCoin(row.outcome, s);
      return {
        side: s,
        name: cleanSideName(spec?.name ?? (s === 0 ? 'Yes' : 'No')),
        coin,
        token: outcomeTokenName(row.outcome, s),
        assetId: outcomeAssetId(row.outcome, s),
        probability: clampProb(midFor(mids, coin)),
      };
    });

    const yes = sides[0]?.probability;
    const no = sides[1]?.probability;
    if (yes != null && no == null) sides[1].probability = clampProb(1 - yes);
    if (no != null && yes == null) sides[0].probability = clampProb(1 - no);

    const market: ListedMarket = {
      id: String(row.outcome),
      outcomeId: row.outcome,
      questionId: question?.question ?? null,
      questionName: question ? stripHip3DexPrefixForDisplay(cleanSideName(question.name)) : null,
      legLabel:
        stripHip3DexPrefixForDisplay(
          cleanSideName(row.name) || sides[0]?.name || `Prediction ${row.outcome}`,
        ),
      multiOutcome: (question?.namedOutcomes.length ?? 0) > 1,
      title,
      subtitle,
      venue: row.venue ?? null,
      quoteToken: row.quoteToken ?? 'USDC',
      sides,
      expiresAt,
      startsAt,
      status: statusFromTimes(expiresAt, startsAt, settled),
      isSports: isSportsMarket(row, templates, question),
      templateId: templateIdFromName(row.name),
      volumeUsd: dayVolumeUsd(volByCoin, row.outcome),
      raw: row,
    };
    listed.push(market);
  }

  listed.sort((a, b) => {
    const rank = (s: MarketStatus) => (s === 'live' ? 0 : s === 'upcoming' ? 1 : 2);
    const d = rank(a.status) - rank(b.status);
    if (d !== 0) return d;
    return (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity);
  });

  if (filter === 'sports') return listed.filter((m) => m.isSports);
  return listed;
}

export async function getListedMarket(id: string | number): Promise<ListedMarket | null> {
  const numeric = Number(id);
  const markets = await listOutcomes({ filter: 'all' });
  if (Number.isFinite(numeric)) {
    return markets.find((m) => m.outcomeId === numeric) ?? null;
  }
  return markets.find((m) => m.id === String(id)) ?? null;
}

function clampCandlePx(n: number): number {
  return Math.min(0.9999, Math.max(0.0001, n));
}

export async function fetchOutcomeCandles(
  outcomeId: number,
  interval: OutcomeCandleInterval,
  startTime: number,
  endTime: number,
  side: OutcomeSide = 0,
): Promise<OutcomeCandle[]> {
  const coins =
    side === 0
      ? [outcomeSpotCoin(outcomeId, 0), outcomeAmmCoin(outcomeId)]
      : [outcomeSpotCoin(outcomeId, 1)];
  for (const coin of coins) {
    try {
      const raw = await hlInfo<unknown>({
        type: 'candleSnapshot',
        req: { coin, interval, startTime, endTime },
      });
      const rows = Array.isArray(raw) ? raw : [];
      const candles: OutcomeCandle[] = [];
      for (const row of rows) {
        const r = asRecord(row) ?? {};
        const c = asNum(r.c ?? r.close);
        const t = asNum(r.t ?? r.T ?? r.time);
        if (c == null || t == null || c <= 0) continue;
        candles.push({
          t,
          o: asNum(r.o ?? r.open) ?? c,
          h: asNum(r.h ?? r.high) ?? c,
          l: asNum(r.l ?? r.low) ?? c,
          c,
        });
      }
      candles.sort((a, b) => a.t - b.t);
      if (candles.length) return candles;
    } catch {
      /* try next coin */
    }
  }
  return [];
}

/** Close of each candle as a probability sample, time-aligned across legs. */
export async function fetchLegCandleSamples(
  legs: Array<{ key: string; outcomeId: number; side: OutcomeSide }>,
  interval: OutcomeCandleInterval,
  startTime: number,
  endTime: number,
): Promise<Record<string, CandleSample[]>> {
  const ids = [...new Set(legs.map((l) => l.outcomeId))];
  const byOutcome = new Map<number, OutcomeCandle[]>();
  await Promise.all(
    ids.map(async (id) => {
      const rows = await fetchOutcomeCandles(id, interval, startTime, endTime, 0);
      byOutcome.set(id, rows);
    }),
  );
  const out: Record<string, CandleSample[]> = {};
  for (const leg of legs) {
    const rows = byOutcome.get(leg.outcomeId) ?? [];
    out[leg.key] = rows.map((c) => ({
      t: c.t,
      p: clampCandlePx(leg.side === 0 ? c.c : 1 - c.c),
    }));
  }
  return out;
}

export async function fetchSpotClearinghouse(user: Hex): Promise<{ balances: Array<Record<string, unknown>> }> {
  const raw = await hlInfo<unknown>({ type: 'spotClearinghouseState', user });
  const rec = asRecord(raw) ?? {};
  const balances = Array.isArray(rec.balances) ? rec.balances : [];
  return {
    balances: balances.map((b) => asRecord(b) ?? {}),
  };
}

/**
 * Resting sells lock `hold` on the token. Close-all must cancel those first
 * or L1 rejects with `Insufficient spot balance asset=…`.
 */
export async function releaseOutcomeSellHolds(input: {
  user: Hex;
  outcomeId: number;
  side: OutcomeSide;
}): Promise<number> {
  const orders = await fetchOutcomeOpenOrders(input.user);
  const working = orders.filter(
    (o) => o.outcomeId === input.outcomeId && o.side === input.side && o.tradeSide === 'sell',
  );
  if (working.length) await cancelOutcomeOrders(working);
  const spot = await fetchSpotClearinghouse(input.user);
  return outcomeFreeShares(spot.balances, input.outcomeId, input.side);
}

/** Spendable spot USDC (total − hold). Outcome buys debit this balance. */
export function spotUsdcAvailable(balances: Array<Record<string, unknown>>): number {
  let free = 0;
  for (const b of balances) {
    const coin = String(b.coin ?? '').toUpperCase();
    const tokenIdx = asNum(b.token);
    if (coin !== 'USDC' && tokenIdx !== 0) continue;
    const total = asNum(b.total) ?? 0;
    const hold = asNum(b.hold) ?? 0;
    const avail = total - hold;
    if (avail > 0) free += avail;
  }
  return free;
}

export function positionsFromSpotBalances(
  balances: Array<Record<string, unknown>>,
  markets: ListedMarket[],
): OutcomePosition[] {
  const byOutcome = new Map(markets.map((m) => [m.outcomeId, m]));
  const out: OutcomePosition[] = [];
  for (const b of balances) {
    const coin = String(b.coin ?? b.token ?? '');
    const parsed = parseSideCoin(coin);
    if (!parsed) continue;
    const shares = asNum(b.total) ?? 0;
    if (shares <= 0) continue;
    const hold = asNum(b.hold) ?? 0;
    const market = byOutcome.get(parsed.outcomeId);
    const side = market?.sides.find((s) => s.side === parsed.side);
    const probability = side?.probability ?? null;
    const costUsd = asNum(b.entryNtl);
    const valueUsd = probability != null ? shares * probability : 0;
    const avgCost = costUsd != null && costUsd > 0 && shares > 0 ? costUsd / shares : null;
    const pnlUsd =
      costUsd != null && costUsd > 0 && probability != null ? valueUsd - costUsd : null;
    out.push({
      outcomeId: parsed.outcomeId,
      side: parsed.side,
      coin: side?.coin ?? outcomeSpotCoin(parsed.outcomeId, parsed.side),
      shares,
      title: market ? displayListedTitle(market) : `Prediction #${parsed.outcomeId}`,
      sideName: side?.name ?? (parsed.side === 0 ? 'Yes' : 'No'),
      probability,
      valueUsd,
      costUsd: costUsd != null && costUsd > 0 ? costUsd : null,
      avgCost,
      pnlUsd,
      availableShares: Math.max(0, shares - hold),
      status: market?.status ?? 'live',
    });
  }
  return out.sort((a, b) => b.valueUsd - a.valueUsd);
}

export type OutcomeClosedLot = {
  id: string;
  outcomeId: number;
  side: OutcomeSide;
  title: string;
  sideName: string;
  shares: number;
  exitPx: number;
  pnlUsd: number;
  proceedsUsd: number;
  closedAt: number;
  fullyClosed: boolean;
  /** Protocol expiry convert — not a book sell. Losing settles can have `exitPx` 0. */
  settled: boolean;
};

/**
 * This wallet's HIP-4 fills only. HL `userFills` is the same as historical
 * orders: up to 2000 of *this user's* fills on every market. We drop perps/spot.
 */
export async function fetchOutcomeFills(user: Hex): Promise<Array<Record<string, unknown>>> {
  const raw = await hlInfo<unknown>({
    type: 'userFills',
    user,
    aggregateByTime: false,
  });
  if (!Array.isArray(raw)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const row of raw) {
    const rec = asRecord(row);
    if (!rec) continue;
    const coin = String(rec.coin ?? '');
    if (!isOutcomeCoinName(coin) || !parseSideCoin(coin)) continue;
    out.push(rec);
  }
  return out;
}

export function outcomeVolumeFromFills(fills: Array<Record<string, unknown>>): number {
  let ntl = 0;
  for (const f of fills) {
    const direct = asNum(f.ntl);
    if (direct != null && direct > 0) {
      ntl += direct;
      continue;
    }
    const px = asNum(f.px);
    const sz = asNum(f.sz);
    if (px != null && sz != null && px > 0 && sz > 0) ntl += px * Math.abs(sz);
  }
  return ntl;
}

export function outcomeRealizedPnlFromFills(fills: Array<Record<string, unknown>>): number {
  let pnl = 0;
  for (const f of fills) {
    const v = asNum(f.closedPnl);
    if (v != null) pnl += v;
  }
  return pnl;
}

/**
 * HL `portfolio` `allTime` last `pnlHistory` point.
 * `allTime` is the account series (spot-style books included). `perpAllTime` is perps only.
 * HIP-4 tokens trade as spot, so a fresh embedded wallet's allTime PnL is the HIP-4 number.
 */
export async function fetchHlAllTimePnl(user: Hex): Promise<number | null> {
  const raw = await hlInfo<unknown>({ type: 'portfolio', user });
  const rows = Array.isArray(raw) ? raw : [];
  for (const row of rows) {
    if (!Array.isArray(row) || row[0] !== 'allTime') continue;
    const data = asRecord(row[1]);
    const hist = data?.pnlHistory;
    if (!Array.isArray(hist) || !hist.length) return 0;
    const last = hist[hist.length - 1];
    return (Array.isArray(last) ? asNum(last[1]) : asNum(last)) ?? 0;
  }
  return null;
}

/** Prefer HL allTime; fall back to HIP-4 marks if that series is still empty. */
export function netPnlUsd(hlAllTime: number | null | undefined, unrealized: number, realized: number): number {
  const hip4 = unrealized + realized;
  if (hlAllTime == null) return hip4;
  if (Math.abs(hlAllTime) < 0.005 && Math.abs(hip4) >= 0.005) return hip4;
  return hlAllTime;
}

/** One history row per close: book sells and HIP-4 `dir: Settlement` converts. */
export function closedLotsFromFills(
  fills: Array<Record<string, unknown>>,
  markets: ListedMarket[],
): OutcomeClosedLot[] {
  const byOutcome = new Map(markets.map((m) => [m.outcomeId, m]));
  const out: OutcomeClosedLot[] = [];
  for (const f of fills) {
    const coin = String(f.coin ?? '');
    const parsed = parseSideCoin(coin);
    if (!parsed) continue;
    const dir = String(f.dir ?? '').toLowerCase();
    const sideFlag = String(f.side ?? '');
    const settled = dir === 'settlement';
    const isSell = settled || dir === 'sell' || sideFlag === 'A';
    if (!isSell) continue;
    const shares = asNum(f.sz) ?? 0;
    const px = asNum(f.px) ?? 0;
    if (shares <= 0) continue;
    // Book sells need a price. Settlement of a losing side is `px: 0` with `closedPnl`.
    if (!settled && !(px > 0)) continue;
    const start = asNum(f.startPosition) ?? 0;
    const market = byOutcome.get(parsed.outcomeId);
    const sideMeta = market?.sides.find((s) => s.side === parsed.side);
    const tid = f.tid != null ? String(f.tid) : `${f.hash ?? ''}:${f.time ?? ''}`;
    out.push({
      id: tid,
      outcomeId: parsed.outcomeId,
      side: parsed.side,
      title: market ? displayListedTitle(market) : `Prediction #${parsed.outcomeId}`,
      sideName: sideMeta?.name ?? (parsed.side === 0 ? 'Yes' : 'No'),
      shares,
      exitPx: px,
      pnlUsd: asNum(f.closedPnl) ?? 0,
      proceedsUsd: shares * px,
      closedAt: asNum(f.time) ?? 0,
      fullyClosed: start > 0 && shares + 1e-9 >= start,
      settled,
    });
  }
  return out.sort((a, b) => b.closedAt - a.closedAt);
}

/**
 * HIP-4 books live in (0, 1). Outcome quotes 0.01¢ ticks (4 decimal probability).
 * Spot `formatPrice` alone allows 5 sig figs / 8 dp, so `mid * 0.92` IOC caps
 * like 0.89534 get rejected: "Price must be divisible by tick size."
 */
const OUTCOME_PX_MIN = 0.0001;
const OUTCOME_PX_MAX = 0.9999;
const OUTCOME_PX_TICK = 1e-4;

function snapOutcomePx(px: number, dir: 'nearest' | 'up' | 'down'): number {
  const clamped = Math.min(OUTCOME_PX_MAX, Math.max(OUTCOME_PX_MIN, px));
  const scaled = clamped / OUTCOME_PX_TICK;
  const stepped =
    dir === 'up'
      ? Math.ceil(scaled - 1e-9)
      : dir === 'down'
        ? Math.floor(scaled + 1e-9)
        : Math.round(scaled);
  return Math.min(OUTCOME_PX_MAX, Math.max(OUTCOME_PX_MIN, stepped * OUTCOME_PX_TICK));
}

function formatOutcomePx(px: number, dir: 'nearest' | 'up' | 'down' = 'nearest'): string {
  const snapped = snapOutcomePx(px, dir);
  const raw = snapped.toFixed(4).replace(/\.?0+$/, '');
  try {
    const formatted = formatPrice(raw, OUTCOME_SZ_DECIMALS, 'spot');
    const n = Number(formatted);
    if (Number.isFinite(n) && n > 0 && n < 1) return formatted;
  } catch {
    /* fall through */
  }
  return raw;
}

function formatOutcomeSz(shares: number): string {
  try {
    const s = formatSize(shares, OUTCOME_SZ_DECIMALS);
    if (s && s !== '0' && Number(s) > 0) return s;
  } catch {
    /* fall through */
  }
  const fallback = OUTCOME_SZ_DECIMALS === 0 ? String(Math.trunc(shares)) : shares.toFixed(OUTCOME_SZ_DECIMALS);
  if (Number(fallback) > 0) return fallback;
  throw new Hip4Error('Size too small for this market');
}

function ceilToLot(shares: number): number {
  return Math.ceil(shares / OUTCOME_LOT - 1e-12) * OUTCOME_LOT;
}

function floorToLot(shares: number): number {
  return Math.floor(shares / OUTCOME_LOT + 1e-12) * OUTCOME_LOT;
}

/**
 * HL rejects `sz * mid < $10` — the IOC/limit price is ignored. A $10 buy
 * sized at 0.61 still fails when mid is 0.55. Compare truncated notional so
 * float dust cannot look like $10 locally and $9.99 on L1.
 */
function wireOutcomePx(px: number): number {
  const n = Number(formatOutcomePx(px));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function sharesMeetMinNotional(shares: number, px: number): boolean {
  if (!(shares > 0) || !(px > 0)) return false;
  const ntl = shares * px;
  if (ntl < MIN_NOTIONAL_USD) return false;
  return Math.floor(ntl * 1e6 + 1e-9) / 1e6 >= MIN_NOTIONAL_USD;
}

function minSharesForNotional(px: number): number {
  const p = wireOutcomePx(px);
  if (!(p > 0)) return 0;
  let shares = ceilToLot(MIN_NOTIONAL_USD / p);
  let guard = 0;
  while (!sharesMeetMinNotional(shares, p) && guard < 16) {
    shares = ceilToLot(shares + OUTCOME_LOT);
    guard += 1;
  }
  return shares;
}

/** Whole-share count that meets $10 notional after lot rounding. */
export function outcomeSharesForUsd(usd: number, px: number): number {
  if (!(usd > 0) || !(px > 0)) return 0;
  const p = wireOutcomePx(px);
  if (!(p > 0)) return 0;
  return Math.max(ceilToLot(usd / p), minSharesForNotional(p));
}

function marketLimitPx(mid: number, tradeSide: 'buy' | 'sell'): number {
  const raw =
    tradeSide === 'buy' ? mid * (1 + OUTCOME_MARKET_SLIPPAGE) : mid * (1 - OUTCOME_MARKET_SLIPPAGE);
  return snapOutcomePx(raw, tradeSide === 'buy' ? 'up' : 'down');
}

/** Sell size: same $ intent as a buy, capped at shares held (never round up past inventory). */
export function outcomeSellSharesForUsd(usd: number, px: number, held: number): number {
  if (!(usd > 0) || !(px > 0) || !(held > 0)) return 0;
  const cap = floorToLot(held);
  if (cap < OUTCOME_LOT) return 0;
  let shares = Math.min(ceilToLot(usd / px), cap);
  const closing = shares + 1e-9 >= cap;
  if (!closing && usd + 1e-9 >= MIN_NOTIONAL_USD) {
    const sellPx = marketLimitPx(px, 'sell');
    shares = Math.min(Math.max(shares, minSharesForNotional(sellPx)), cap);
  }
  return shares;
}

function readOrderStatus(result: unknown): OutcomeOrderResult {
  const rec = asRecord(result);
  const response = asRecord(rec?.response);
  const data = asRecord(response?.data);
  const statuses = Array.isArray(data?.statuses) ? data?.statuses : [];
  const first = statuses[0];
  const row = asRecord(first);
  if (row && 'error' in row) {
    throw new Hip4Error(String(row.error || 'Order was rejected'), String(row.error));
  }
  const filled = asRecord(row?.filled);
  if (filled) {
    return {
      status: 'filled',
      raw: result,
      filledShares: asNum(filled.totalSz),
      avgPx: asNum(filled.avgPx),
    };
  }
  if (row && 'resting' in row) {
    return { status: 'resting', raw: result, filledShares: null, avgPx: null };
  }
  return { status: 'unknown', raw: result, filledShares: null, avgPx: null };
}

async function agentExchange() {
  return requireHip4Runtime().agentExchange();
}

export async function placeOutcomeOrder(input: PlaceOutcomeOrderInput): Promise<OutcomeOrderResult> {
  if (!Number.isFinite(input.outcomeId) || input.outcomeId < 0) {
    throw new Hip4Error('Invalid market');
  }
  if (input.side !== 0 && input.side !== 1) {
    throw new Hip4Error('Invalid outcome side');
  }
  if (input.orderType !== 'market' && input.orderType !== 'limit') {
    throw new Hip4Error('Invalid order type');
  }

  const coin = outcomeSpotCoin(input.outcomeId, input.side);
  const mids = await fetchAllMids().catch(() => ({} as Record<string, string>));
  const bookMid = clampProb(midFor(mids, coin));
  const liveMid = clampProb(input.referencePx ?? null) ?? bookMid;
  const mid = liveMid;
  if (input.orderType === 'market' && (mid == null || mid <= 0)) {
    throw new Hip4Error('No live price for this market yet');
  }

  let px: number;
  if (input.orderType === 'limit') {
    px = Number(input.limitPx);
    if (!Number.isFinite(px) || px <= 0 || px >= 1) {
      throw new Hip4Error('Limit price must be between 0 and 1');
    }
  } else {
    px = marketLimitPx(mid as number, input.tradeSide);
  }
  const p = formatOutcomePx(px, input.orderType === 'limit' ? 'nearest' : input.tradeSide === 'buy' ? 'up' : 'down');
  const pxWire = Number(p);
  if (!Number.isFinite(pxWire) || pxWire <= 0) {
    throw new Hip4Error('Invalid price');
  }

  const sizingPx = input.orderType === 'limit' ? pxWire : (mid as number);
  const exactShares =
    Number.isFinite(input.sizeShares) && (input.sizeShares as number) > 0
      ? (input.sizeShares as number)
      : null;
  const sharesRaw = exactShares ?? input.sizeUsd / sizingPx;
  if (!Number.isFinite(sharesRaw) || sharesRaw <= 0) {
    throw new Hip4Error('Invalid size');
  }

  // Exact share counts (sells / close) must not be rounded up past inventory.
  // USD-denominated buys still round up so a $10 chip clears the $10 floor.
  // L1 min-notional uses mid (and the limit if it is lower), not the IOC cap.
  const ntlMid = wireOutcomePx(bookMid ?? mid ?? pxWire);
  const ntlPx = Math.min(pxWire, ntlMid || pxWire);
  let shares = exactShares != null ? floorToLot(sharesRaw) : ceilToLot(sharesRaw);
  const skipMin = Boolean(input.skipMinNotional);
  if (!skipMin) {
    shares = Math.max(shares, minSharesForNotional(ntlPx));
    if (exactShares != null && input.tradeSide === 'sell') {
      shares = Math.min(shares, floorToLot(exactShares));
    }
  }
  if (!Number.isFinite(shares) || shares <= 0) {
    throw new Hip4Error('Size too small for this market');
  }

  let s = formatOutcomeSz(shares);
  if (!skipMin) {
    let guard = 0;
    while (!sharesMeetMinNotional(Number(s), ntlPx)) {
      if (exactShares != null && input.tradeSide === 'sell' && shares + OUTCOME_LOT > exactShares + 1e-12) {
        throw new Hip4Error(`Order must be at least $${MIN_NOTIONAL_USD}`);
      }
      shares = ceilToLot(shares + OUTCOME_LOT);
      s = formatOutcomeSz(shares);
      guard += 1;
      if (guard > 8) {
        throw new Hip4Error(`Order must be at least $${MIN_NOTIONAL_USD}`);
      }
    }
  }
  const exchange = await agentExchange();
  const rt = requireHip4Runtime();
  const builder = {
    b: rt.getBuilderAddress(),
    f: rt.getBuilderFeeTenthsBps(),
  };

  try {
    const result = await exchange.order({
      orders: [
        {
          a: outcomeAssetId(input.outcomeId, input.side),
          b: input.tradeSide === 'buy',
          p,
          s,
          r: false,
          t: { limit: { tif: input.orderType === 'limit' ? 'Gtc' : 'FrontendMarket' } },
        },
      ],
      grouping: 'na',
      builder,
    });
    return readOrderStatus(result);
  } catch (err) {
    if (err instanceof Hip4Error) throw err;
    const msg = err instanceof Error ? err.message : String(err ?? 'Order failed');
    throw new Hip4Error(msg, msg);
  }
}

export async function sendUserOutcome(action: UserOutcomeAction): Promise<unknown> {
  const exchange = await agentExchange();
  const fn = (exchange as unknown as { userOutcome?: (a: UserOutcomeAction) => Promise<unknown> }).userOutcome;
  if (typeof fn !== 'function') {
    throw new Hip4Error('userOutcome is not available in this SDK build');
  }
  return fn.call(exchange, action);
}

export function impliedOdds(probability: number | null): string {
  if (probability == null || !Number.isFinite(probability) || probability <= 0) return '—';
  return `${Math.round(probability * 100)}¢`;
}

export function impliedPercent(probability: number | null): string {
  if (probability == null || !Number.isFinite(probability)) return '—';
  return `${Math.round(probability * 100)}%`;
}
