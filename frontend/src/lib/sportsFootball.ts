import { api } from './api';
import { isTimestampOnLocalDay } from './marketCatalog';

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

export type EplBoard = {
  configured: boolean;
  season: number;
  league: { id: number; name: string; logo: string };
  featured: FootballFixture | null;
  upcoming: FootballFixture[];
};

export async function fetchEplBoard(): Promise<EplBoard> {
  const { data } = await api.get<EplBoard>('/sports/football/epl');
  return data;
}

/** Live now, or kickoff on the local calendar day — not tomorrow’s date-feed row. */
export function isTodaysEplFixture(fixture: FootballFixture, now = Date.now()): boolean {
  if (fixture.finished) return false;
  if (fixture.live) return true;
  return isTimestampOnLocalDay(fixture.kickoffAt, now);
}

export function formatFootballEvent(ev: FootballEvent): string {
  const minute =
    ev.elapsed == null
      ? ''
      : ev.extra != null
        ? `${ev.elapsed}+${ev.extra}'`
        : `${ev.elapsed}'`;
  const who = ev.player || ev.team;
  const what = ev.type === 'Card' ? ev.detail || ev.type : ev.type;
  return [minute, who, what].filter(Boolean).join(' · ');
}

export function formatKickoff(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
