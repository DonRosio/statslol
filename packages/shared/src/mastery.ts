import { z } from 'zod';

/** What a player did with one champion over the years: Riot's champion mastery. */
export const championMasterySchema = z.object({
  championId: z.number().int(),
  // The mastery level: it has no upper bound (30 and more for the champions played the most).
  level: z.number().int().nonnegative(),
  points: z.number().int().nonnegative(),
  // When the champion was last played; null when Riot does not say.
  lastPlayedAt: z.iso.datetime().nullable(),
  // Where the player stands in the current level: the points made in it, and the ones left
  // to reach the next.
  pointsSinceLastLevel: z.number().int().nonnegative(),
  pointsUntilNextLevel: z.number().int().nonnegative(),
});

export type ChampionMastery = z.infer<typeof championMasterySchema>;

/** The mastery of a player: every champion played, the most points first, and the totals. */
export const playerMasterySchema = z.object({
  // The mastery score: the levels of all the champions added up.
  score: z.number().int().nonnegative(),
  totalPoints: z.number().int().nonnegative(),
  champions: z.array(championMasterySchema),
});

export type PlayerMastery = z.infer<typeof playerMasterySchema>;
