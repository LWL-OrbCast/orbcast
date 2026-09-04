/**
 * Map a HIP-4 book onto a file in `frontend/assets/images/symbols/`.
 * Filenames are the source of truth (`lol-icon.webp` → League of Legends).
 * No API-Sports fetch — static pack only.
 */

import { displayOracleSymbol, marketSpecFields, type ListedMarket } from './hip4';
import { chipFromSportSignals } from './sportsCatalog';

export type MarketSymbolKey =
  | 'btc'
  | 'eth'
  | 'sol'
  | 'hype'
  | 'gold'
  | 'oil'
  | 'silver'
  | 'sp500'
  | 'xyz100'
  | 'dram'
  | 'nbis'
  | 'skhx'
  | 'sndk'
  | 'spcx'
  | 'lol'
  | 'epl'
  | 'nfl'
  | 'mlb'
  | 'uefa'
  | 'fed'
  | 'arsenal'
  | 'madrid'
  | 'mancity'
  | 'manutd';

/** Photo-style marks that should fill the rounded box. Logos use contain. */
const COVER_KEYS = new Set<MarketSymbolKey>(['lol', 'epl']);

const TICKER_KEY: Record<string, MarketSymbolKey> = {
  btc: 'btc',
  bitcoin: 'btc',
  xbt: 'btc',
  eth: 'eth',
  ethereum: 'eth',
  ether: 'eth',
  sol: 'sol',
  solana: 'sol',
  hype: 'hype',
  gold: 'gold',
  xau: 'gold',
  silver: 'silver',
  xag: 'silver',
  cl: 'oil',
  oil: 'oil',
  wti: 'oil',
  brent: 'oil',
  crude: 'oil',
  sp500: 'sp500',
  spx: 'sp500',
  us500: 'sp500',
  xyz100: 'xyz100',
  us100: 'xyz100',
  dram: 'dram',
  nbis: 'nbis',
  skhx: 'skhx',
  sndk: 'sndk',
  spcx: 'spcx',
};

const TEAM_RE: [RegExp, MarketSymbolKey][] = [
  [/\barsenal\b/i, 'arsenal'],
  [/\b(manchester united|man united|man utd|manutd)\b/i, 'manutd'],
  [/\b(manchester city|man city|mancity)\b/i, 'mancity'],
  [/\breal madrid\b/i, 'madrid'],
];

/** Title-blob tickers. Do not scan `cl` here — it false-hits LCS / CLE. */
const BLOB_TICKER_RE: [RegExp, MarketSymbolKey][] = [
  [/\b(btc|bitcoin|xbt)\b/i, 'btc'],
  [/\b(eth|ethereum|ether)\b/i, 'eth'],
  [/\b(solana|\bsol\b)\b/i, 'sol'],
  [/\bhype\b/i, 'hype'],
  [/\b(gold|xau)\b/i, 'gold'],
  [/\b(silver|xag)\b/i, 'silver'],
  [/\b(wti|brent|crude(?:\s+oil)?)\b/i, 'oil'],
  [/\b(s(?:&| and )?p\s*500|sp500|\bspx\b|us500)\b/i, 'sp500'],
  [/\b(xyz\s*-?100|us100)\b/i, 'xyz100'],
  [/\bdram\b/i, 'dram'],
  [/\bnbis\b/i, 'nbis'],
  [/\bskhx\b/i, 'skhx'],
  [/\bsndk\b/i, 'sndk'],
  [/\bspcx\b/i, 'spcx'],
];

export function symbolObjectFit(key: MarketSymbolKey): 'cover' | 'contain' {
  return COVER_KEYS.has(key) ? 'cover' : 'contain';
}

/**
 * @param questionLevel  Use the event/league mark (ignore a single-team `participant`).
 *                       Trending / featured / ticket headings show the question title.
 */
export function symbolKeyForMarket(
  market: ListedMarket,
  opts?: { questionLevel?: boolean },
): MarketSymbolKey | null {
  const fields = marketSpecFields(market);
  const oracle = oracleKey(fields);
  if (oracle) return oracle;

  if (!opts?.questionLevel) {
    const team = teamKey(fields, market);
    if (team) return team;
  }

  const league = leagueKey(fields, market);
  if (league) return league;

  const fromBlob = blobTickerKey(displayHay(market));
  if (fromBlob) return fromBlob;

  if (market.isSports) {
    const chip = chipFromSportSignals(
      fields.sport,
      fields.competition,
      displayHay(market),
    );
    if (chip === 'nfl') return 'nfl';
    if (chip === 'mlb') return 'mlb';
  }
  return null;
}

function oracleKey(fields: Record<string, string>): MarketSymbolKey | null {
  for (const raw of [fields.underlying, fields.perp, fields.hlPerp, fields.coin]) {
    if (!raw) continue;
    const ticker = displayOracleSymbol(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!ticker) continue;
    const hit = TICKER_KEY[ticker];
    if (hit) return hit;
  }
  return null;
}

function teamKey(fields: Record<string, string>, market: ListedMarket): MarketSymbolKey | null {
  if (fields.participantA && fields.participantB) return null;
  const named = fields.participant || fields.participantA || fields.participantB || '';
  return teamFromText(named) ?? teamFromText(market.legLabel);
}

function teamFromText(text: string): MarketSymbolKey | null {
  if (!text) return null;
  for (const [re, key] of TEAM_RE) {
    if (re.test(text)) return key;
  }
  return null;
}

function leagueKey(fields: Record<string, string>, market: ListedMarket): MarketSymbolKey | null {
  const hay = [
    fields.competition,
    fields.sport,
    fields.institution,
    fields.policyMeasure,
    fields.decisionLabel,
    displayHay(market),
  ]
    .filter(Boolean)
    .join(' ');
  if (/league of legends|\blol\b|\blcs\b|\blec\b|\blpl\b/i.test(hay)) return 'lol';
  if (/premier league|\bepl\b/i.test(hay)) return 'epl';
  if (/uefa|champions league/i.test(hay)) return 'uefa';
  if (/\bnfl\b|national football league/i.test(hay)) return 'nfl';
  if (/\bmlb\b|major league baseball|\bbaseball\b/i.test(hay)) return 'mlb';
  if (/federal reserve|\bfomc\b|federal funds|\bthe fed\b|\bfed\b/i.test(hay)) return 'fed';
  return null;
}

function blobTickerKey(hay: string): MarketSymbolKey | null {
  for (const [re, key] of BLOB_TICKER_RE) {
    if (re.test(hay)) return key;
  }
  return null;
}

function displayHay(market: ListedMarket): string {
  return [
    market.title,
    market.subtitle,
    market.legLabel,
    market.questionName,
    market.questionDescription,
    market.raw.description,
    market.raw.name,
  ]
    .filter(Boolean)
    .join(' ');
}
