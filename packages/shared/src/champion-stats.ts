import { z } from 'zod';

import { currentSeason, seasonIdSchema } from './seasons.ts';

/**
 * What a player did with a champion, in one mode and one position: the totals of the games
 * (not the averages, which cannot be added up). The site adds these records up as the visitor
 * filters them, so the API answers once.
 */
export const championRecordSchema = z.object({
  championId: z.number().int(),
  // Riot's internal name, used in Data Dragon file names (e.g. "MonkeyKing" for Wukong).
  championName: z.string(),
  // Riot's queue ID: 420 ranked solo/duo, 440 ranked flex, 450 ARAM...
  queueId: z.number().int().nonnegative(),
  // TOP, JUNGLE, MIDDLE, BOTTOM or UTILITY; null in modes without positions (ARAM...).
  position: z.string().nullable(),
  games: z.number().int().positive(),
  wins: z.number().int().nonnegative(),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  // Minions and monsters killed.
  creepScore: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  // Arena: the places of the games added up (1 to 6 each, the first is the best); 0 in the
  // other modes, which have no place.
  placementSum: z.number().int().nonnegative(),
});

export type ChampionRecord = z.infer<typeof championRecordSchema>;

/** What a player did with each champion in a season, from the games the site has stored. */
export const championStatsSchema = z.object({
  season: seasonIdSchema,
  records: z.array(championRecordSchema),
});

export type ChampionStatsAnswer = z.infer<typeof championStatsSchema>;

/**
 * The loading of a season's games, which runs on the server. "idle": not started (nothing
 * known yet); "queued": waiting for the loading of another player to end (the Riot key's
 * calls are shared); "running": `done` of `total` games are stored; "done": all of them
 * are (but `failed` that Riot did not give); "failed": the loading stopped for good.
 */
export const seasonSyncSchema = z.object({
  state: z.enum(['idle', 'queued', 'running', 'done', 'failed']),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export type SeasonSync = z.infer<typeof seasonSyncSchema>;

/** `?season=2026` of the routes; the season in progress when it is left out. */
export const seasonQuerySchema = z.object({
  season: seasonIdSchema.default(() => currentSeason(new Date()).id),
});
