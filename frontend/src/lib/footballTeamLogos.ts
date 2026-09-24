/**
 * Club crests for stadium chrome when the overlay has no fixture.
 * API-Sports ids use `media.api-sports.io` (no football quota).
 * A few UEFA clubs use bundled `assets/images/symbols/` art (`local:…`)
 * because their CDN slot is empty or unverified.
 */
import { teamMatchScore } from './marketCatalog';

const media = (id: number) => `https://media.api-sports.io/football/teams/${id}.png`;

export const LOCAL_FOOTBALL_CREST_PREFIX = 'local:';

export function localFootballCrestKey(logo: string): string | null {
  if (!logo.startsWith(LOCAL_FOOTBALL_CREST_PREFIX)) return null;
  const key = logo.slice(LOCAL_FOOTBALL_CREST_PREFIX.length);
  return key || null;
}

/** API-Football team ids — persistent across competitions. */
const TEAMS: { id: number; names: string[] }[] = [
  // Premier League
  { id: 33, names: ['Manchester United', 'Man United', 'Man Utd'] },
  { id: 34, names: ['Newcastle United', 'Newcastle'] },
  { id: 35, names: ['Bournemouth', 'AFC Bournemouth', 'Bournemouth AFC'] },
  { id: 36, names: ['Fulham'] },
  { id: 39, names: ['Wolves', 'Wolverhampton', 'Wolverhampton Wanderers'] },
  { id: 40, names: ['Liverpool'] },
  { id: 41, names: ['Southampton'] },
  { id: 42, names: ['Arsenal'] },
  { id: 44, names: ['Burnley'] },
  { id: 45, names: ['Everton'] },
  { id: 46, names: ['Leicester', 'Leicester City'] },
  { id: 47, names: ['Tottenham', 'Tottenham Hotspur', 'Spurs'] },
  { id: 48, names: ['West Ham', 'West Ham United'] },
  { id: 49, names: ['Chelsea'] },
  { id: 50, names: ['Manchester City', 'Man City'] },
  { id: 51, names: ['Brighton', 'Brighton & Hove Albion'] },
  { id: 52, names: ['Crystal Palace'] },
  { id: 55, names: ['Brentford'] },
  { id: 57, names: ['Ipswich', 'Ipswich Town'] },
  { id: 63, names: ['Leeds', 'Leeds United'] },
  { id: 65, names: ['Nottingham Forest', 'Nottm Forest', 'Forest'] },
  { id: 66, names: ['Aston Villa'] },
  { id: 71, names: ['Norwich', 'Norwich City'] },
  { id: 746, names: ['Sunderland'] },

  // La Liga
  { id: 529, names: ['Barcelona', 'FC Barcelona'] },
  { id: 530, names: ['Atletico Madrid', 'Atletico'] },
  { id: 531, names: ['Athletic Club', 'Athletic Bilbao'] },
  { id: 532, names: ['Valencia'] },
  { id: 533, names: ['Villarreal', 'Villarreal CF'] },
  { id: 535, names: ['Malaga', 'Málaga', 'Malaga CF'] },
  { id: 536, names: ['Sevilla'] },
  { id: 538, names: ['Celta Vigo', 'Celta'] },
  { id: 540, names: ['Espanyol'] },
  { id: 541, names: ['Real Madrid'] },
  { id: 542, names: ['Alaves', 'Deportivo Alaves'] },
  { id: 543, names: ['Real Betis', 'Betis'] },
  { id: 544, names: ['Deportivo La Coruna', 'Deportivo'] },
  { id: 546, names: ['Getafe'] },
  { id: 547, names: ['Girona'] },
  { id: 548, names: ['Real Sociedad'] },
  { id: 720, names: ['Valladolid', 'Real Valladolid'] },
  { id: 727, names: ['Osasuna'] },
  { id: 728, names: ['Rayo Vallecano', 'Rayo'] },
  { id: 798, names: ['Mallorca', 'Real Mallorca'] },
  { id: 797, names: ['Elche', 'Elche CF'] },
  { id: 539, names: ['Levante', 'Levante UD'] },
  { id: 718, names: ['Oviedo', 'Real Oviedo'] },
  { id: 534, names: ['Las Palmas'] },
  { id: 537, names: ['Leganes'] },

  // Serie A
  { id: 487, names: ['Lazio'] },
  { id: 488, names: ['Sassuolo'] },
  { id: 489, names: ['AC Milan', 'Milan'] },
  { id: 490, names: ['Cagliari'] },
  { id: 492, names: ['Napoli'] },
  { id: 494, names: ['Udinese'] },
  { id: 495, names: ['Genoa'] },
  { id: 496, names: ['Juventus', 'Juve'] },
  { id: 497, names: ['AS Roma', 'Roma'] },
  { id: 499, names: ['Atalanta'] },
  { id: 500, names: ['Bologna'] },
  { id: 502, names: ['Fiorentina'] },
  { id: 503, names: ['Torino'] },
  { id: 504, names: ['Verona', 'Hellas Verona'] },
  { id: 505, names: ['Inter', 'Inter Milan', 'Internazionale'] },
  { id: 512, names: ['Frosinone'] },
  { id: 517, names: ['Venezia'] },
  { id: 523, names: ['Parma'] },
  { id: 867, names: ['Lecce'] },
  { id: 895, names: ['Como'] },
  { id: 1579, names: ['Monza'] },

  // UEFA club names — overlay now fetches UCL / UEL / UECL fixtures;
  // this map still fills crests when the board misses a side.
  { id: 79, names: ['Lille', 'LOSC', 'LOSC Lille'] },
  { id: 80, names: ['Lyon', 'Olympique Lyonnais'] },
  { id: 85, names: ['Paris Saint Germain', 'PSG'] },
  { id: 91, names: ['Monaco', 'AS Monaco'] },
  { id: 116, names: ['Lens', 'RC Lens'] },
  { id: 157, names: ['Bayern Munich', 'Bayern', 'Bayern Munchen', 'FC Bayern Munich'] },
  { id: 160, names: ['Freiburg', 'SC Freiburg'] },
  { id: 161, names: ['Wolfsburg', 'VfL Wolfsburg'] },
  { id: 162, names: ['Werder Bremen', 'SV Werder Bremen'] },
  { id: 163, names: ['Borussia Monchengladbach', "Borussia Mönchengladbach", "M'gladbach", 'Gladbach'] },
  { id: 164, names: ['Mainz', 'Mainz 05', 'FSV Mainz 05'] },
  { id: 165, names: ['Borussia Dortmund', 'Dortmund'] },
  { id: 167, names: ['Hoffenheim', 'TSG Hoffenheim', '1899 Hoffenheim'] },
  { id: 168, names: ['Bayer Leverkusen', 'Leverkusen'] },
  { id: 169, names: ['Eintracht Frankfurt', 'Frankfurt'] },
  { id: 170, names: ['Augsburg', 'FC Augsburg'] },
  { id: 172, names: ['Stuttgart', 'VfB Stuttgart'] },
  { id: 173, names: ['RB Leipzig', 'Leipzig'] },
  { id: 182, names: ['Union Berlin', '1. FC Union Berlin', 'FC Union Berlin'] },
  { id: 194, names: ['Ajax'] },
  { id: 197, names: ['PSV', 'PSV Eindhoven'] },
  { id: 201, names: ['Feyenoord'] },
  { id: 211, names: ['Benfica'] },
  { id: 212, names: ['Porto', 'FC Porto'] },
  { id: 217, names: ['Braga', 'Sporting Braga'] },
  { id: 228, names: ['Sporting CP', 'Sporting Lisbon'] },
  { id: 247, names: ['Celtic', 'Celtic FC'] },
  { id: 257, names: ['Rangers'] },
  { id: 321, names: ['Lillestrom', 'Lillestrøm', 'Lillestrom SK'] },
  { id: 327, names: ['Bodo/Glimt', 'Bodo Glimt', 'FK Bodo/Glimt'] },
  { id: 335, names: ['Sabah', 'Sabah Baku', 'Sabah FK'] },
  { id: 347, names: ['Lech Poznan', 'Lech Poznań'] },
  { id: 413, names: ['NEC Nijmegen'] },
  { id: 550, names: ['Shakhtar Donetsk', 'Shakhtar', 'FC Shakhtar Donetsk'] },
  { id: 551, names: ['Basel', 'FC Basel'] },
  { id: 553, names: ['Olympiacos'] },
  { id: 554, names: ['Anderlecht'] },
  { id: 556, names: ['Qarabag', 'Qarabağ'] },
  { id: 560, names: ['Slavia Prague', 'Slavia Praha', 'SK Slavia Praha'] },
  { id: 565, names: ['Young Boys', 'BSC Young Boys'] },
  { id: 567, names: ['Viktoria Plzen', 'Viktoria Plzeň', 'FC Viktoria Plzen', 'Plzen'] },
  { id: 569, names: ['Club Brugge', 'Club Bruges'] },
  { id: 571, names: ['Red Bull Salzburg', 'Salzburg'] },
  { id: 572, names: ['Dynamo Kyiv', 'Dynamo Kiev'] },
  { id: 575, names: ['AEK Athens'] },
  { id: 601, names: ['Austria Wien', 'Austria Vienna', 'FK Austria Wien'] },
  { id: 608, names: ['Hajduk Split', 'Hajduk'] },
  { id: 611, names: ['Fenerbahce', 'Fenerbahçe'] },
  { id: 617, names: ['Panathinaikos'] },
  { id: 619, names: ['PAOK'] },
  { id: 637, names: ['Sturm Graz', 'SK Sturm Graz'] },
  { id: 645, names: ['Galatasaray'] },
  { id: 549, names: ['Besiktas', 'Besiktas JK', 'Beşiktaş'] },
  { id: 646, names: ['Levski Sofia', 'Levski'] },
  { id: 651, names: ['Ferencvaros', 'Ferencvarosi TC', 'Ferencváros', 'Ferencvárosi TC'] },
  { id: 1124, names: ['OFI', 'OFI Crete', 'OFI Crete FC'] },
  { id: 1393, names: [
    'Union Saint-Gilloise',
    'Union St. Gilloise',
    'Union SG',
    'Royale Union Saint-Gilloise',
  ] },
  { id: 4799, names: ['Torreense', 'SCU Torreense', 'SC Uniao Torreense', 'SC União Torreense'] },
];

/** API-Football national team ids — used for UNL / Euro / World Cup chrome. */
const NATIONAL_TEAMS: { id: number; names: string[] }[] = [
  { id: 1, names: ['Belgium'] },
  { id: 2, names: ['France'] },
  { id: 3, names: ['Croatia'] },
  { id: 5, names: ['Sweden'] },
  { id: 9, names: ['Spain'] },
  { id: 10, names: ['England'] },
  { id: 14, names: ['Serbia'] },
  { id: 15, names: ['Switzerland'] },
  { id: 18, names: ['Iceland'] },
  { id: 21, names: ['Denmark'] },
  { id: 24, names: ['Poland'] },
  { id: 25, names: ['Germany'] },
  { id: 27, names: ['Portugal'] },
  { id: 767, names: ['Wales'] },
  { id: 768, names: ['Italy'] },
  { id: 769, names: ['Hungary'] },
  { id: 770, names: ['Czech Republic', 'Czechia'] },
  { id: 771, names: ['Northern Ireland'] },
  { id: 772, names: ['Ukraine'] },
  { id: 773, names: ['Slovakia'] },
  { id: 774, names: ['Romania'] },
  { id: 775, names: ['Austria'] },
  { id: 776, names: ['Republic of Ireland', 'Rep. of Ireland', 'Rep. Of Ireland', 'Ireland'] },
  { id: 777, names: ['Turkey', 'Türkiye', 'Turkiye'] },
  { id: 778, names: ['Albania'] },
  { id: 1090, names: ['Norway'] },
  { id: 1091, names: ['Slovenia'] },
  { id: 1093, names: ['Gibraltar'] },
  { id: 1094, names: ['Armenia'] },
  { id: 1095, names: ['Kazakhstan'] },
  { id: 1096, names: ['Azerbaijan'] },
  { id: 1098, names: ['Faroe Islands'] },
  { id: 1099, names: ['Finland'] },
  { id: 1100, names: ['Belarus'] },
  { id: 1101, names: ['Estonia'] },
  { id: 1103, names: ['Bulgaria'] },
  { id: 1104, names: ['Georgia'] },
  { id: 1105, names: ['North Macedonia', 'FYR Macedonia', 'Macedonia'] },
  { id: 1107, names: ['Liechtenstein'] },
  { id: 1108, names: ['Scotland'] },
  { id: 1109, names: ['Montenegro'] },
  { id: 1110, names: ['Andorra'] },
  { id: 1111, names: ['Kosovo'] },
  { id: 1112, names: ['Malta'] },
  { id: 1113, names: ['Bosnia and Herzegovina', 'Bosnia & Herzegovina', 'Bosnia'] },
  { id: 1114, names: ['Moldova'] },
  { id: 1116, names: ['Israel'] },
  { id: 1117, names: ['Greece'] },
  { id: 1118, names: ['Netherlands', 'Holland'] },
];

export type FootballCrestOpts = {
  /** Prefer country crests; skip club aliases (Monaco, etc.). */
  national?: boolean;
};

/** Bundled symbols — no API-Sports id (placeholder or unverified CDN slot). */
const LOCAL_TEAMS: { key: string; names: string[] }[] = [
  { key: 'marseille', names: ['Marseille', 'Olympique Marseille', 'Olympique de Marseille'] },
  { key: 'slovan', names: ['Slovan Bratislava', 'SK Slovan Bratislava', 'ŠK Slovan Bratislava', 'S.Bratislava', 'Bratislava'] },
  { key: 'lask', names: ['LASK', 'LASK Linz'] },
  { key: 'viking', names: ['Viking FK', 'Viking'] },
];

function bestCrestIn(
  name: string,
  rows: { id: number | null; names: string[]; logo: string }[],
): { id: number | null; logo: string; score: number } | null {
  let best: { id: number | null; logo: string; score: number } | null = null;
  for (const row of rows) {
    for (const alias of row.names) {
      const score = teamMatchScore(name, alias);
      if (score <= 0) continue;
      if (!best || score > best.score) best = { id: row.id, logo: row.logo, score };
    }
  }
  return best;
}

export function footballTeamCrest(
  name: string,
  opts?: FootballCrestOpts,
): { id: number | null; logo: string } | null {
  const n = name.trim();
  if (!n) return null;
  const nationalRows = NATIONAL_TEAMS.map((row) => ({
    id: row.id,
    names: row.names,
    logo: media(row.id),
  }));
  if (opts?.national) {
    const hit = bestCrestIn(n, nationalRows);
    return hit ? { id: hit.id, logo: hit.logo } : null;
  }
  const clubRows = [
    ...TEAMS.map((row) => ({ id: row.id, names: row.names, logo: media(row.id) })),
    ...LOCAL_TEAMS.map((row) => ({
      id: null as number | null,
      names: row.names,
      logo: `${LOCAL_FOOTBALL_CREST_PREFIX}${row.key}`,
    })),
  ];
  const hit = bestCrestIn(n, clubRows);
  return hit ? { id: hit.id, logo: hit.logo } : null;
}

export function withFootballTeamCrest<T extends { id: number | null; name: string; logo: string }>(
  team: T,
  opts?: FootballCrestOpts,
): T {
  if (team.logo) return team;
  const hit = footballTeamCrest(team.name, opts);
  if (!hit) return team;
  return { ...team, id: team.id ?? hit.id, logo: hit.logo };
}

export function withFootballFixtureCrests<
  T extends { home: { id: number | null; name: string; logo: string }; away: { id: number | null; name: string; logo: string } },
>(fx: T, opts?: FootballCrestOpts): T {
  const home = withFootballTeamCrest(fx.home, opts);
  const away = withFootballTeamCrest(fx.away, opts);
  if (home === fx.home && away === fx.away) return fx;
  return { ...fx, home, away };
}
