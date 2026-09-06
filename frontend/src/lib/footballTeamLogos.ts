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
  { id: 35, names: ['Bournemouth', 'AFC Bournemouth'] },
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
  { id: 746, names: ['Sunderland'] },

  // La Liga
  { id: 529, names: ['Barcelona', 'FC Barcelona'] },
  { id: 530, names: ['Atletico Madrid', 'Atletico'] },
  { id: 531, names: ['Athletic Club', 'Athletic Bilbao'] },
  { id: 532, names: ['Valencia'] },
  { id: 533, names: ['Villarreal'] },
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
  { id: 165, names: ['Borussia Dortmund', 'Dortmund'] },
  { id: 168, names: ['Bayer Leverkusen', 'Leverkusen'] },
  { id: 169, names: ['Eintracht Frankfurt', 'Frankfurt'] },
  { id: 172, names: ['Stuttgart', 'VfB Stuttgart'] },
  { id: 173, names: ['RB Leipzig', 'Leipzig'] },
  { id: 194, names: ['Ajax'] },
  { id: 197, names: ['PSV', 'PSV Eindhoven'] },
  { id: 201, names: ['Feyenoord'] },
  { id: 211, names: ['Benfica'] },
  { id: 212, names: ['Porto', 'FC Porto'] },
  { id: 217, names: ['Braga', 'Sporting Braga'] },
  { id: 228, names: ['Sporting CP', 'Sporting Lisbon'] },
  { id: 247, names: ['Celtic'] },
  { id: 257, names: ['Rangers'] },
  { id: 327, names: ['Bodo/Glimt', 'Bodo Glimt', 'FK Bodo/Glimt'] },
  { id: 335, names: ['Sabah', 'Sabah Baku', 'Sabah FK'] },
  { id: 550, names: ['Shakhtar Donetsk', 'Shakhtar', 'FC Shakhtar Donetsk'] },
  { id: 551, names: ['Basel', 'FC Basel'] },
  { id: 553, names: ['Olympiacos'] },
  { id: 554, names: ['Anderlecht'] },
  { id: 556, names: ['Qarabag', 'Qarabağ'] },
  { id: 560, names: ['Slavia Prague', 'Slavia Praha', 'SK Slavia Praha'] },
  { id: 565, names: ['Young Boys', 'BSC Young Boys'] },
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
];

/** Bundled symbols — no API-Sports id (placeholder or unverified CDN slot). */
const LOCAL_TEAMS: { key: string; names: string[] }[] = [
  { key: 'marseille', names: ['Marseille', 'Olympique Marseille', 'Olympique de Marseille'] },
  { key: 'slovan', names: ['Slovan Bratislava', 'SK Slovan Bratislava', 'ŠK Slovan Bratislava'] },
  { key: 'lask', names: ['LASK', 'LASK Linz'] },
  { key: 'viking', names: ['Viking FK', 'Viking'] },
];

export function footballTeamCrest(name: string): { id: number | null; logo: string } | null {
  const n = name.trim();
  if (!n) return null;
  let best: { id: number | null; logo: string; score: number } | null = null;
  for (const row of TEAMS) {
    for (const alias of row.names) {
      const score = teamMatchScore(n, alias);
      if (score <= 0) continue;
      if (!best || score > best.score) best = { id: row.id, logo: media(row.id), score };
    }
  }
  for (const row of LOCAL_TEAMS) {
    for (const alias of row.names) {
      const score = teamMatchScore(n, alias);
      if (score <= 0) continue;
      if (!best || score > best.score) {
        best = { id: null, logo: `${LOCAL_FOOTBALL_CREST_PREFIX}${row.key}`, score };
      }
    }
  }
  if (!best) return null;
  return { id: best.id, logo: best.logo };
}

export function withFootballTeamCrest<T extends { id: number | null; name: string; logo: string }>(
  team: T,
): T {
  if (team.logo) return team;
  const hit = footballTeamCrest(team.name);
  if (!hit) return team;
  return { ...team, id: team.id ?? hit.id, logo: hit.logo };
}

export function withFootballFixtureCrests<
  T extends { home: { id: number | null; name: string; logo: string }; away: { id: number | null; name: string; logo: string } },
>(fx: T): T {
  const home = withFootballTeamCrest(fx.home);
  const away = withFootballTeamCrest(fx.away);
  if (home === fx.home && away === fx.away) return fx;
  return { ...fx, home, away };
}
