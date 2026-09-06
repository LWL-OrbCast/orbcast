import { api } from './api';
import { isTimestampOnLocalDay } from './marketCatalog';
import type { FootballBoard, FootballEvent, FootballFixture } from './footballChrome';

export type {
  FootballBoard,
  FootballEvent,
  FootballFixture,
  FootballGoals,
  FootballTeam,
} from './footballChrome';

export {
  boardFixtures,
  boardHasLiveFixture,
  footballChromeFixture,
  footballLeagueFromCompetition,
  syntheticFootballFixture,
} from './footballChrome';

/** @deprecated Use FootballBoard — same `/sports/football/epl` payload. */
export type EplBoard = FootballBoard;

export async function fetchEplBoard(): Promise<FootballBoard> {
  const { data } = await api.get<FootballBoard>('/sports/football/epl');
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
