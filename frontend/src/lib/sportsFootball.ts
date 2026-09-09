import { api } from './api';
import { rememberFootballBoard } from './footballBoardState';
import {
  boardFixtures,
  type FootballBoard,
  type FootballEvent,
  type FootballFixture,
} from './footballChrome';
import { isTimestampOnLocalDay } from './marketCatalog';

export type {
  FootballBoard,
  FootballEvent,
  FootballEventKind,
  FootballFixture,
  FootballGoals,
  FootballTeam,
} from './footballChrome';

export {
  boardFixtures,
  boardHasLiveFixture,
  canOpenFootballEvents,
  catalogFootballFixtures,
  footballChromeFixture,
  footballEventKind,
  footballEventLabel,
  footballEventMinute,
  footballLeagueFromCompetition,
  formatFootballEvent,
  previewFootballEvents,
  shouldFetchFootballEvents,
  syntheticFootballFixture,
} from './footballChrome';

export type FootballEventsPayload = {
  fixtureId: number;
  events: FootballEvent[];
  configured?: boolean;
};

export async function fetchFootballEvents(fixtureId: number): Promise<FootballEventsPayload> {
  const { data } = await api.get<FootballEventsPayload>(`/sports/football/events/${fixtureId}`);
  return data;
}

/** @deprecated Use FootballBoard — same `/sports/football/epl` payload. */
export type EplBoard = FootballBoard;

export async function fetchEplBoard(): Promise<FootballBoard> {
  const { data } = await api.get<FootballBoard>('/sports/football/epl');
  rememberFootballBoard(boardFixtures(data));
  return data;
}

/** Live now, or kickoff on the local calendar day — not tomorrow’s date-feed row. */
export function isTodaysEplFixture(fixture: FootballFixture, now = Date.now()): boolean {
  if (fixture.finished) return false;
  if (fixture.live) return true;
  return isTimestampOnLocalDay(fixture.kickoffAt, now);
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
