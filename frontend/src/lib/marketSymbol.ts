/**
 * Map a HIP-4 book onto a file in `frontend/assets/images/symbols/`.
 * Filenames are the source of truth (`lol-icon.webp` → League of Legends).
 * No API-Sports fetch — static pack only.
 */

import { displayOracleSymbol, marketSpecFields, type ListedMarket } from './hip4';
import { footballCompetitionLogoUri } from './footballChrome';
import { chipFromSportSignals } from './sportsCatalog';

export type MarketSymbolKey =
  | 'btc'
  | 'eth'
  | 'sol'
  | 'hype'
  | 'zec'
  | 'gold'
  | 'oil'
  | 'silver'
  | 'sp500'
  | 'xyz100'
  | 'dram'
  | 'nbis'
  | 'skhx'
  | 'skhy'
  | 'sndk'
  | 'spcx'
  | 'meta'
  | 'intc'
  | 'crcl'
  | 'mu'
  | 'lol'
  | 'epl'
  | 'laliga'
  | 'seriea'
  | 'usopen'
  | 'nfl'
  | 'mlb'
  | 'uefa'
  | 'fed'
  | 'pons'
  | 'arsenal'
  | 'madrid'
  | 'mancity'
  | 'manutd'
  | 'marseille'
  | 'slovan'
  | 'lask'
  | 'viking'
  | 'ufc';

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
  zec: 'zec',
  zcash: 'zec',
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
  skhy: 'skhy',
  skhynix: 'skhy',
  sndk: 'sndk',
  spcx: 'spcx',
  meta: 'meta',
  intc: 'intc',
  intel: 'intc',
  crcl: 'crcl',
  mu: 'mu',
  micron: 'mu',
  pons: 'pons',
};

const TEAM_RE: [RegExp, MarketSymbolKey][] = [
  [/\barsenal\b/i, 'arsenal'],
  [/\b(manchester united|man united|man utd|manutd)\b/i, 'manutd'],
  [/\b(manchester city|man city|mancity)\b/i, 'mancity'],
  [/\breal madrid\b/i, 'madrid'],
  [/\b(?:olympique(?:\s+de)?\s+)?marseille\b/i, 'marseille'],
  [/slovan\s+bratislava/i, 'slovan'],
  [/\blask(?:\s+linz)?\b/i, 'lask'],
  [/\bviking(?:\s+fk)?\b/i, 'viking'],
];

/** Title-blob tickers. Do not scan `cl` here — it false-hits LCS / CLE. */
const BLOB_TICKER_RE: [RegExp, MarketSymbolKey][] = [
  [/\b(btc|bitcoin|xbt)\b/i, 'btc'],
  [/\b(eth|ethereum|ether)\b/i, 'eth'],
  [/\b(solana|\bsol\b)\b/i, 'sol'],
  [/\bhype\b/i, 'hype'],
  [/\b(zec|zcash)\b/i, 'zec'],
  [/\b(gold|xau)\b/i, 'gold'],
  [/\b(silver|xag)\b/i, 'silver'],
  [/\b(wti|brent|crude(?:\s+oil)?)\b/i, 'oil'],
  [/\b(s(?:&| and )?p\s*500|sp500|\bspx\b|us500)\b/i, 'sp500'],
  [/\b(xyz\s*-?100|us100)\b/i, 'xyz100'],
  [/\bdram\b/i, 'dram'],
  [/\bnbis\b/i, 'nbis'],
  [/\bskhx\b/i, 'skhx'],
  [/\bskhy\b|sk\s*hynix/i, 'skhy'],
  [/\bsndk\b/i, 'sndk'],
  [/\bspcx\b/i, 'spcx'],
  [/\bmeta\b/i, 'meta'],
  [/\b(intc|intel)\b/i, 'intc'],
  [/\bcrcl\b/i, 'crcl'],
  [/\b(mu|micron)\b/i, 'mu'],
  [/\bpons\b/i, 'pons'],
];

export function symbolObjectFit(key: MarketSymbolKey): 'cover' | 'contain' {
  return COVER_KEYS.has(key) ? 'cover' : 'contain';
}

/** Bundled mark first; otherwise a media.api-sports.io league logo (no quota). */
export function competitionMarkUri(market: ListedMarket): string | null {
  const fields = marketSpecFields(market);
  return (
    footballCompetitionLogoUri(fields.competition) ||
    footballCompetitionLogoUri(displayHay(market))
  );
}

export type CatalogMark =
  | { kind: 'key'; key: MarketSymbolKey }
  | { kind: 'remote'; uri: string };

/**
 * Catalog thumbs. The bundled `uefa` asset is Champions League only —
 * Europa / Conference / Nations League use the remote league logo so they
 * do not inherit the UCL mark. Featured chrome already uses fixture.league.logo.
 */
export function catalogMarkForMarket(
  market: ListedMarket,
  opts?: { questionLevel?: boolean },
): CatalogMark | null {
  const key = symbolKeyForMarket(market, opts);
  const remote = competitionMarkUri(market);
  if (remote && (key == null || key === 'uefa')) return { kind: 'remote', uri: remote };
  if (key) return { kind: 'key', key };
  return null;
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
    if (chip === 'mma') return 'ufc';
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
  if (/la\s*liga|\blaliga\b|primera divisi/i.test(hay)) return 'laliga';
  if (/\bseri[ae]\s*a\b/i.test(hay)) return 'seriea';
  if (/\bus\s*[- ]?open\b/i.test(hay) && !/\b(golf|pga|surfing|open\s+cup)\b/i.test(hay)) {
    return 'usopen';
  }
  if (/champions\s*league|\bucl\b/i.test(hay) && !/conference|europa\s*league|nations\s*league/i.test(hay)) {
    return 'uefa';
  }
  if (/\bnfl\b|national football league/i.test(hay)) return 'nfl';
  if (/\bmlb\b|major league baseball|\bbaseball\b/i.test(hay)) return 'mlb';
  if (/\bufc\b|\bmma\b/i.test(hay)) return 'ufc';
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
