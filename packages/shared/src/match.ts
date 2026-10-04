import { z } from 'zod';

/** Number of matches in a page of a player's history. */
export const MATCHES_PER_PAGE = 10;

/** How a game ended for a player. A "remake" was abandoned in its first minutes: it counts for nothing. */
export const matchResultSchema = z.enum(['win', 'loss', 'remake']);

export type MatchResult = z.infer<typeof matchResultSchema>;

/** One game of a player's history, from that player's point of view. */
export const matchSummarySchema = z.object({
  // Riot's match ID, e.g. "EUW1_7123456789".
  id: z.string(),
  // Riot's queue ID, which tells the game mode: 420 ranked solo/duo, 440 ranked flex, 450 ARAM...
  queueId: z.number().int().nonnegative(),
  startedAt: z.iso.datetime(),
  durationSeconds: z.number().int().nonnegative(),
  // In Arena, a "win" is a place in the top half: the place itself says more.
  result: matchResultSchema,
  // Place of the player's team in modes ranked by place (Arena: 1 to 6); null in the others.
  placement: z.number().int().positive().nullable(),
  championId: z.number().int(),
  // Riot's internal name, used in Data Dragon file names (e.g. "MonkeyKing" for Wukong).
  championName: z.string(),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  // Minions and monsters killed.
  creepScore: z.number().int().nonnegative(),
  // TOP, JUNGLE, MIDDLE, BOTTOM or UTILITY; null in modes without positions (ARAM, Arena...).
  position: z.string().nullable(),
});

export type MatchSummary = z.infer<typeof matchSummarySchema>;

/** Answer of GET /api/v1/players/:region/:name/:tag/matches: one page, the most recent first. */
export const matchHistorySchema = z.object({
  matches: z.array(matchSummarySchema),
  // Value of `start` for the next page; null when there are no more games.
  nextStart: z.number().int().nonnegative().nullable(),
});

export type MatchHistory = z.infer<typeof matchHistorySchema>;
