import { z } from 'zod';

/** The IDs of the seasons (the year, for now): what the routes accept. */
export const seasonIdSchema = z.enum(['2026']);

export type SeasonId = z.infer<typeof seasonIdSchema>;

export interface Season {
  readonly id: SeasonId;
  readonly label: string;
  /** ISO date, UTC. */
  readonly startsAt: string;
  /** ISO date, UTC; null for the season in progress. */
  readonly endsAt: string | null;
}

/**
 * The seasons of the ranked ladder, which the champion statistics are counted by. Riot
 * numbers them by year: 2026 is the 16th. The latest comes first, and the one in progress
 * has no end. Riot also cuts a year into three splits (patches 26.01, 26.09 and 26.17): the
 * site shows the whole season only. When the next season is announced, add it here (and its
 * ID to the schema above) and give the previous one an end: the patch day, in UTC (a game
 * played on that day before the patch reaches a server is counted in the new season, a
 * difference of a few games).
 */
export const SEASONS: readonly [Season, ...Season[]] = [
  {
    id: '2026',
    label: 'Season 16',
    startsAt: '2026-01-08T00:00:00Z',
    endsAt: null,
  },
];

const SEASON_BY_ID: ReadonlyMap<SeasonId, Season> = new Map(
  SEASONS.map((season) => [season.id, season]),
);

/** The season with this ID (the schema has checked it is one of them). */
export function seasonById(id: SeasonId): Season {
  // Not reachable: every ID of the schema is one of SEASONS (a test checks it).
  return SEASON_BY_ID.get(id) ?? SEASONS[0];
}

/** The season in progress at `now` (the one the statistics open on): the latest one, whatever the date is before the first. */
export function currentSeason(now: Date): Season {
  return (
    SEASONS.find((season) => Date.parse(season.startsAt) <= now.getTime()) ??
    SEASONS[0]
  );
}

/** The first and last moments of a season in milliseconds; the end is `now` for the current one. */
export function seasonWindow(
  season: Season,
  now: Date,
): { readonly fromMs: number; readonly toMs: number } {
  return {
    fromMs: Date.parse(season.startsAt),
    toMs:
      season.endsAt === null
        ? Math.max(now.getTime(), Date.parse(season.startsAt))
        : Date.parse(season.endsAt),
  };
}
