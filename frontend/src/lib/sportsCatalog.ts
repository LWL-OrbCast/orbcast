/**
 * Catalog sport chips + API-Sports product map.
 *
 * HIP-4 `sport` / `competition` pipe fields land on a chip here.
 * Overlay chrome (scores, fixtures) uses the matching API-Sports host —
 * one dashboard key, separate quotas. Odds stay unused.
 */

export type TopicChipId = 'crypto' | 'stocks' | 'economics';

/** Association football (API-Sports FOOTBALL). Not NFL. */
export type SportOnlyChipId =
  | 'football'
  | 'nfl'
  | 'nba'
  | 'basketball'
  | 'mlb'
  | 'hockey'
  | 'mma'
  | 'rugby'
  | 'volleyball'
  | 'afl'
  | 'f1'
  | 'handball'
  | 'tennis'
  | 'esports';

export type SportChipId = 'all' | TopicChipId | SportOnlyChipId;

/** All → Crypto → Stocks → Economics → API-Sports sports → HIP-4-only extras. */
export const CATALOG_CHIPS: SportChipId[] = [
  'all',
  'crypto',
  'stocks',
  'economics',
  'football',
  'nfl',
  'nba',
  'basketball',
  'mlb',
  'hockey',
  'mma',
  'rugby',
  'volleyball',
  'afl',
  'f1',
  'handball',
  'tennis',
  'esports',
];

export const SPORT_ONLY_CHIPS: SportOnlyChipId[] = [
  'football',
  'nfl',
  'nba',
  'basketball',
  'mlb',
  'hockey',
  'mma',
  'rugby',
  'volleyball',
  'afl',
  'f1',
  'handball',
  'tennis',
  'esports',
];

export type ApiSportsProduct = {
  chip: SportOnlyChipId;
  /** Dashboard row label. */
  dashboard: string;
  host: string;
  docs: string;
};

/**
 * Subscribed API-Sports products (same `API_SPORTS_KEY`, separate hosts/quotas).
 * Tennis + esports are HIP-4 catalog chips only — no API-Sports overlay yet.
 */
export const API_SPORTS_PRODUCTS: Record<string, ApiSportsProduct> = {
  football: {
    chip: 'football',
    dashboard: 'FOOTBALL',
    host: 'https://v3.football.api-sports.io',
    docs: 'https://api-sports.io/documentation/football/v3',
  },
  nfl: {
    chip: 'nfl',
    dashboard: 'NFL',
    host: 'https://v1.american-football.api-sports.io',
    docs: 'https://api-sports.io/documentation/nfl/v1',
  },
  nba: {
    chip: 'nba',
    dashboard: 'NBA',
    host: 'https://v2.nba.api-sports.io',
    docs: 'https://api-sports.io/documentation/nba/v2',
  },
  basketball: {
    chip: 'basketball',
    dashboard: 'BASKETBALL',
    host: 'https://v1.basketball.api-sports.io',
    docs: 'https://api-sports.io/documentation/basketball/v1',
  },
  mlb: {
    chip: 'mlb',
    dashboard: 'BASEBALL',
    host: 'https://v1.baseball.api-sports.io',
    docs: 'https://api-sports.io/documentation/baseball/v1',
  },
  hockey: {
    chip: 'hockey',
    dashboard: 'HOCKEY',
    host: 'https://v1.hockey.api-sports.io',
    docs: 'https://api-sports.io/documentation/hockey/v1',
  },
  mma: {
    chip: 'mma',
    dashboard: 'MMA',
    host: 'https://v1.mma.api-sports.io',
    docs: 'https://api-sports.io/documentation/mma/v1',
  },
  rugby: {
    chip: 'rugby',
    dashboard: 'RUGBY',
    host: 'https://v1.rugby.api-sports.io',
    docs: 'https://api-sports.io/documentation/rugby/v1',
  },
  volleyball: {
    chip: 'volleyball',
    dashboard: 'VOLLEYBALL',
    host: 'https://v1.volleyball.api-sports.io',
    docs: 'https://api-sports.io/documentation/volleyball/v1',
  },
  afl: {
    chip: 'afl',
    dashboard: 'AFL',
    host: 'https://v1.afl.api-sports.io',
    docs: 'https://api-sports.io/documentation/afl/v1',
  },
  f1: {
    chip: 'f1',
    dashboard: 'FORMULA-1',
    host: 'https://v1.formula-1.api-sports.io',
    docs: 'https://api-sports.io/documentation/formula-1/v1',
  },
  handball: {
    chip: 'handball',
    dashboard: 'HANDBALL',
    host: 'https://v1.handball.api-sports.io',
    docs: 'https://api-sports.io/documentation/handball/v1',
  },
};

/** HIP-4 `sport:` aliases. `football` is ambiguous (soccer vs NFL) — handled below. */
const SPORT_FIELD_CHIP: Record<string, SportOnlyChipId> = {
  'football/soccer': 'football',
  soccer: 'football',
  'association football': 'football',
  nfl: 'nfl',
  'american football': 'nfl',
  'american-football': 'nfl',
  nba: 'nba',
  basketball: 'basketball',
  baseball: 'mlb',
  mlb: 'mlb',
  hockey: 'hockey',
  'ice hockey': 'hockey',
  nhl: 'hockey',
  mma: 'mma',
  ufc: 'mma',
  rugby: 'rugby',
  'rugby union': 'rugby',
  'rugby league': 'rugby',
  volleyball: 'volleyball',
  afl: 'afl',
  'australian football': 'afl',
  'australian rules': 'afl',
  'formula 1': 'f1',
  'formula-1': 'f1',
  f1: 'f1',
  handball: 'handball',
  tennis: 'tennis',
  atp: 'tennis',
  wta: 'tennis',
  esports: 'esports',
  esport: 'esports',
  'e-sports': 'esports',
  'e-sport': 'esports',
};

/**
 * Detect order matters: NFL before soccer. Bare `football` matches
 * “National Football League” — never use it as a soccer signal first.
 */
export const SPORT_CHIP_RE: Record<SportOnlyChipId, RegExp> = {
  esports:
    /\b(e-?sports?|lol|league of legends|dota|cs2|counter.?strike|valorant|overwatch)\b/i,
  nfl: /\b(nfl|ncaaf|ncaa football|american football|american-football|super bowl|national football league)\b/i,
  nba: /\b(nba)\b/i,
  basketball: /\b(basketball|fiba|euroleague|ncaab|ncaa basketball)\b/i,
  mlb: /\b(mlb|baseball|world series)\b/i,
  hockey: /\b(nhl|hockey|stanley cup)\b/i,
  mma: /\b(ufc|mma)\b/i,
  rugby: /\b(rugby(?:\s+(?:union|league))?|six nations|world rugby)\b/i,
  volleyball: /\b(volleyball)\b/i,
  afl: /\b(afl|australian rules|australian football)\b/i,
  f1: /\b(formula\s*-?\s*1|\bf1\b|grand prix)\b/i,
  handball: /\b(handball)\b/i,
  tennis: /\b(tennis|atp|wta|grand slam)\b/i,
  football:
    /\b(soccer|fifa|uefa|premier league|\bepl\b|bundesliga|laliga|la liga|serie a|ligue 1|champions league|world\s*cup|\bmls\b|football\/soccer)\b/i,
};

const DETECT_ORDER: SportOnlyChipId[] = [
  'esports',
  'nfl',
  'nba',
  'afl',
  'f1',
  'hockey',
  'mlb',
  'mma',
  'rugby',
  'volleyball',
  'handball',
  'tennis',
  'basketball',
  'football',
];

function normalizeSportKey(raw: string): string {
  return raw.toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function chipFromSportSignals(
  sport: string | undefined,
  competition: string | undefined,
  blob: string,
): SportOnlyChipId | null {
  const sportKey = normalizeSportKey(sport ?? '');
  const competitionKey = normalizeSportKey(competition ?? '');
  if (sportKey && sportKey !== 'football') {
    const aliased = SPORT_FIELD_CHIP[sportKey];
    if (aliased) return aliased;
  }

  const hay = `${sportKey} ${competitionKey} ${blob}`.toLowerCase();
  for (const id of DETECT_ORDER) {
    if (SPORT_CHIP_RE[id].test(hay)) return id;
  }

  // Outcome.xyz NFL winner used sport:football (no “soccer”). Soccer used football/soccer.
  if (sportKey === 'football') {
    return SPORT_CHIP_RE.nfl.test(hay) ? 'nfl' : 'football';
  }
  return null;
}
