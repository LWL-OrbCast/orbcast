/** Finished EPL / La Liga / Serie A fixtures from the overlay (not HIP-4 settle). */
export type FinishedFootballRef = {
  home: string;
  away: string;
};

let finished: FinishedFootballRef[] = [];

export function rememberFootballBoard(
  fixtures: Array<{
    home: { name: string };
    away: { name: string };
    finished?: boolean;
  }>,
) {
  finished = fixtures
    .filter((f) => f.finished)
    .map((f) => ({ home: f.home.name, away: f.away.name }));
}

export function rememberedFinishedFootball(): FinishedFootballRef[] {
  return finished;
}
