import { z } from 'zod';

import { regionSchema } from './region.ts';

/** Ranked tiers, from lowest to highest. */
export const tierSchema = z.enum([
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'EMERALD',
  'DIAMOND',
  'MASTER',
  'GRANDMASTER',
  'CHALLENGER',
]);

export type Tier = z.infer<typeof tierSchema>;

export const divisionSchema = z.enum(['I', 'II', 'III', 'IV']);

export type Division = z.infer<typeof divisionSchema>;

/** A player's rank in one ranked queue. */
export const rankSchema = z.object({
  tier: tierSchema,
  // Null for Master, Grandmaster and Challenger, which have no divisions.
  division: divisionSchema.nullable(),
  leaguePoints: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
});

export type Rank = z.infer<typeof rankSchema>;

/**
 * Answer of GET /api/v1/players/:region/:name/:tag. The PUUID is left out on purpose:
 * clients identify a player by Riot ID, which stays the same when we change API keys.
 */
export const playerProfileSchema = z.object({
  // Written the way its owner chose (Riot ignores case in searches).
  riotId: z.object({ gameName: z.string(), tagLine: z.string() }),
  region: regionSchema,
  profileIconId: z.number().int().nonnegative(),
  summonerLevel: z.number().int().nonnegative(),
  // Null when the player is not ranked in that queue.
  ranks: z.object({
    solo: rankSchema.nullable(),
    flex: rankSchema.nullable(),
  }),
});

export type PlayerProfile = z.infer<typeof playerProfileSchema>;
