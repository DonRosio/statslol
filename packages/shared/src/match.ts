import { z } from 'zod';

import { rankSchema } from './player-profile.ts';
import { regionSchema } from './region.ts';

/** Number of matches in a page of a player's history. */
export const MATCHES_PER_PAGE = 10;

/** The 6 slots of an inventory, then the trinket. */
export const ITEM_SLOTS = 7;

/** How a game ended for a player. A "remake" was abandoned in its first minutes: it counts for nothing. */
export const matchResultSchema = z.enum(['win', 'loss', 'remake']);

export type MatchResult = z.infer<typeof matchResultSchema>;

/** One of the 10 players of a match (18 in Arena). */
export const matchParticipantSchema = z.object({
  // Riot's number for the player in this match (1 to 10, 1 to 18 in Arena): the details of
  // the match give the same one, which tells who is who without a PUUID.
  participantId: z.number().int().positive(),
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
  // The level of the champion at the end of the game.
  level: z.number().int().nonnegative(),
  // Vision score: wards placed and destroyed, and what they showed. What counts for a support.
  visionScore: z.number().int().nonnegative(),
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

/** Riot's ID of a match: the server, then a number, e.g. "EUW1_7123456789". It ends up in URLs. */
export const matchIdSchema = z.string().regex(/^[A-Z0-9]+_\d+$/);

/** Parameters of GET /api/v1/matches/:region/:matchId. */
export const matchParamsSchema = z.object({
  region: regionSchema,
  matchId: matchIdSchema,
});

export type MatchParams = z.infer<typeof matchParamsSchema>;

/** What a team took on the map. */
export const matchObjectivesSchema = z.object({
  towers: z.number().int().nonnegative(),
  inhibitors: z.number().int().nonnegative(),
  dragons: z.number().int().nonnegative(),
  barons: z.number().int().nonnegative(),
  heralds: z.number().int().nonnegative(),
  // Void grubs, the small monsters of the early game.
  grubs: z.number().int().nonnegative(),
});

export type MatchObjectives = z.infer<typeof matchObjectivesSchema>;

/** One player in the details of a match. */
export const matchPlayerSchema = z.object({
  // The one of the players of the match history (`participants` of a MatchSummary).
  participantId: z.number().int().positive(),
  // Riot ID at the time of the match; null in matches before 2023, which did not tell it.
  riotId: z.object({ gameName: z.string(), tagLine: z.string() }).nullable(),
  championId: z.number().int(),
  // Riot's internal name, used in Data Dragon file names (e.g. "MonkeyKing" for Wukong).
  championName: z.string(),
  // The level of the champion at the end of the game.
  level: z.number().int().nonnegative(),
  // TOP, JUNGLE, MIDDLE, BOTTOM or UTILITY; null in modes without positions.
  position: z.string().nullable(),
  spellIds: matchSummarySchema.shape.spellIds,
  runes: matchSummarySchema.shape.runes,
  itemIds: matchSummarySchema.shape.itemIds,
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  creepScore: z.number().int().nonnegative(),
  // Damage dealt to enemy champions: what the bar of the player shows.
  damageToChampions: z.number().int().nonnegative(),
  gold: z.number().int().nonnegative(),
  visionScore: z.number().int().nonnegative(),
});

export type MatchPlayer = z.infer<typeof matchPlayerSchema>;

/** A side of the map (or, in Arena, a team of players) and its players. */
export const matchTeamSchema = z.object({
  // 100 or 200 (blue or red side); in Arena, the number of the team (1 to 6 in 2026).
  id: z.number().int().nonnegative(),
  result: matchResultSchema,
  // Arena: the place of the team (1 to 6); null in the other modes.
  placement: z.number().int().positive().nullable(),
  // Totals of the players.
  kills: z.number().int().nonnegative(),
  gold: z.number().int().nonnegative(),
  // Null in Arena, and in the oldest matches.
  objectives: matchObjectivesSchema.nullable(),
  players: z.array(matchPlayerSchema),
});

export type MatchTeam = z.infer<typeof matchTeamSchema>;

/**
 * Answer of GET /api/v1/matches/:region/:matchId: every team of a finished game, with all
 * its players. The teams are in the order to show: the 2 sides, or in Arena the best place
 * first.
 */
export const matchDetailsSchema = z.object({
  id: matchIdSchema,
  queueId: z.number().int().nonnegative(),
  startedAt: z.iso.datetime(),
  durationSeconds: z.number().int().nonnegative(),
  teams: z.array(matchTeamSchema),
});

export type MatchDetails = z.infer<typeof matchDetailsSchema>;

/**
 * Answer of GET /api/v1/matches/:region/:matchId/ranks: the ranked solo/duo rank of each player of
 * a match, by `participantId` (as text: the keys of a JSON object). Null for a player with no
 * rank; a player whose rank could not be asked is left out.
 */
export const matchRanksSchema = z.object({
  ranks: z.record(z.string().regex(/^\d+$/), rankSchema.nullable()),
});

export type MatchRanks = z.infer<typeof matchRanksSchema>;
