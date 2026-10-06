import { z } from 'zod';

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
});

export type ChampionRecord = z.infer<typeof championRecordSchema>;

/** The records of the matches kept in the database for a player, one per champion, mode and position. */
export const championRecordsSchema = z.object({
  records: z.array(championRecordSchema),
});

export type ChampionRecords = z.infer<typeof championRecordsSchema>;
