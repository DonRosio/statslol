import { z } from 'zod';

/** Number of matches in a page of a player's history. */
export const MATCHES_PER_PAGE = 10;

/** The 6 slots of an inventory, then the trinket. */
export const ITEM_SLOTS = 7;

/** How a game ended for a player. A "remake" was abandoned in its first minutes: it counts for nothing. */
export const matchResultSchema = z.enum(['win', 'loss', 'remake']);

export type MatchResult = z.infer<typeof matchResultSchema>;

/** One of the 10 players of a match (18 in Arena). */
export const matchParticipantSchema = z.object({
  // Riot ID at the time of the match; null in matches before 2023, which did not tell it.
  // Not checked like a Riot ID typed in the search: it is what Riot said.
  riotId: z.object({ gameName: z.string(), tagLine: z.string() }).nullable(),
  championId: z.number().int(),
  // Riot's internal name, used in Data Dragon file names (e.g. "MonkeyKing" for Wukong).
  championName: z.string(),
  // 100 or 200 (blue or red side).
  teamId: z.number().int().nonnegative(),
  // Arena: the team inside the match (1 to 6 in 2026); null in the other modes.
  subteamId: z.number().int().positive().nullable(),
  // True for the player whose history this is: the one to highlight in the list.
  isPlayer: z.boolean(),
});

export type MatchParticipant = z.infer<typeof matchParticipantSchema>;

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
  // The 2 summoner spells (Flash, Ignite...) by their `key` in Data Dragon (see staticData).
  // Empty in a mode without spells.
  spellIds: z.array(z.number().int().positive()).max(2),
  // The keystone (the main rune, e.g. Conqueror) and the secondary tree, by Data Dragon's
  // rune IDs. Null in modes without runes (Arena).
  runes: z
    .object({
      keystoneId: z.number().int().positive(),
      secondaryStyleId: z.number().int().positive(),
    })
    .nullable(),
  // The 6 slots of the inventory at the end of the game, then the trinket, by Data Dragon's
  // item ID. 0: empty slot.
  itemIds: z.array(z.number().int().nonnegative()).length(ITEM_SLOTS),
  // The 10 players (18 in Arena), in Riot's order: the blue side, then the red side.
  participants: z.array(matchParticipantSchema),
});

export type MatchSummary = z.infer<typeof matchSummarySchema>;

/** Answer of GET /api/v1/players/:region/:name/:tag/matches: one page, the most recent first. */
export const matchHistorySchema = z.object({
  matches: z.array(matchSummarySchema),
  // Value of `start` for the next page; null when there are no more games.
  nextStart: z.number().int().nonnegative().nullable(),
});

export type MatchHistory = z.infer<typeof matchHistorySchema>;
