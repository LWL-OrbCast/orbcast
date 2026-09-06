/**
 * Stadium chrome for football contests (EPL / La Liga / Serie A crests via
 * the server overlay; HIP-4 kickoff if the fixture is not in the board).
 * Types only — no Expo `api` client, so Vite can import this file.
 */
import { marketSpecFields, type ListedMarket } from './hip4';
import {
  contestParticipants,
  fixtureForMarket,
  isFootballContestMarket,
} from './marketCatalog';

export type FootballTeam = {
  id: number | null;
  name: string;
  logo: string;
};

export type FootballGoals = {
  home: number | null;
  away: number | null;
};

export type FootballEvent = {
  elapsed: number | null;
  extra: number | null;
  type: string;
  detail: string;
  team: string;
  player: string;
};

export type FootballFixture = {
  fixtureId: number;
  kickoffAt: number | null;
  status: string;
  statusLong: string;
  elapsed: number | null;
  live: boolean;
  finished: boolean;
  home: FootballTeam;
  away: FootballTeam;
  goals: FootballGoals;
  league: { id: number; name: string; logo: string; round: string };
  venue: string;
  events?: FootballEvent[];
};

export type FootballBoard = {
  configured: boolean;
  season: number;
  league: { id: number; name: string; logo: string };
  featured: FootballFixture | null;
  upcoming: FootballFixture[];
  matches?: FootballFixture[];
};

/** media.api-sports.io — does not count against the football quota. */
const LEAGUE_MEDIA: Record<number, { id: number; name: string; logo: string }> = {
  39: {
    id: 39,
    name: 'Premier League',
    logo: 'https://media.api-sports.io/football/leagues/39.png',
  },
  140: {
    id: 140,
    name: 'La Liga',
    logo: 'https://media.api-sports.io/football/leagues/140.png',
  },
  135: {
    id: 135,
    name: 'Serie A',
    logo: 'https://media.api-sports.io/football/leagues/135.png',
  },
  2: {
    id: 2,
    name: 'UEFA Champions League',
    logo: 'https://media.api-sports.io/football/leagues/2.png',
  },
};

export function footballLeagueFromCompetition(competition: string): {
  id: number;
  name: string;
  logo: string;
} {
  const s = competition.toLowerCase();
  if (/la\s*liga|laliga|spanish\s*primera/.test(s)) return LEAGUE_MEDIA[140];
  if (/serie\s*a|seria\s*a/.test(s)) return LEAGUE_MEDIA[135];
  if (/premier\s*league|\bepl\b|english\s*premier/.test(s)) return LEAGUE_MEDIA[39];
  if (/champions\s*league|\bucl\b/.test(s)) return LEAGUE_MEDIA[2];
  const name = competition.trim();
  return { id: 0, name: name || 'Football', logo: '' };
}

export function boardFixtures(board?: FootballBoard | null): FootballFixture[] {
  if (!board) return [];
  const rows = board.matches?.length
    ? board.matches
    : [board.featured, ...(board.upcoming ?? [])];
  const seen = new Set<number>();
  const out: FootballFixture[] = [];
  for (const f of rows) {
    if (!f || seen.has(f.fixtureId)) continue;
    seen.add(f.fixtureId);
    out.push(f);
  }
  return out;
}

export function boardHasLiveFixture(board?: FootballBoard | null): boolean {
  return boardFixtures(board).some((f) => f.live);
}

export function syntheticFootballFixture(m: ListedMarket): FootballFixture | null {
  const pair = contestParticipants(m);
  if (!pair) return null;
  const [a, b] = pair;
  const fields = marketSpecFields(m);
  const league = footballLeagueFromCompetition(fields.competition ?? '');
  const live = m.status === 'live';
  const finished = m.status === 'settled';
  return {
    fixtureId: -Math.abs(m.outcomeId || m.id.length),
    kickoffAt: m.startsAt,
    status: live ? 'LIVE' : finished ? 'FT' : 'NS',
    statusLong: live ? 'Live' : finished ? 'Match Finished' : 'Not Started',
    elapsed: null,
    live,
    finished,
    home: { id: null, name: a, logo: '' },
    away: { id: null, name: b, logo: '' },
    goals: { home: null, away: null },
    league: { ...league, round: '' },
    venue: '',
  };
}

/** API fixture when the board has this match; otherwise HIP-4 names + kickoff. */
export function footballChromeFixture(
  fixtures: FootballFixture[],
  m: ListedMarket,
): FootballFixture | null {
  if (!isFootballContestMarket(m)) return null;
  return fixtureForMarket(fixtures, m) ?? syntheticFootballFixture(m);
}
