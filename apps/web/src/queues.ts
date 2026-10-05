import type { MatchSummary } from '@statslol/shared';

/**
 * Names of the game modes, by Riot's queue ID, as short as they can be: "Solo/Duo" and
 * "Flex" are ranked, "Normal" is the draft or the blind pick. Source: Riot's list,
 * https://static.developer.riotgames.com/docs/lol/queues.json, which lags behind the game
 * (e.g. 1750, the Arena of 2026, is missing): unknown queues are named QUEUE_FALLBACK_NAME.
 */
const QUEUE_NAMES: ReadonlyMap<number, string> = new Map([
  [0, 'Custom game'],
  [76, 'URF'],
  [325, 'All Random'],
  [400, 'Normal'],
  [420, 'Solo/Duo'],
  [430, 'Normal'],
  [440, 'Flex'],
  [450, 'ARAM'],
  [480, 'Swiftplay'],
  [490, 'Quickplay'],
  [700, 'Clash'],
  [720, 'ARAM Clash'],
  [870, 'Co-op vs. AI'],
  [880, 'Co-op vs. AI'],
  [890, 'Co-op vs. AI'],
  [900, 'ARURF'],
  [1020, 'One for All'],
  [1300, 'Nexus Blitz'],
  [1400, 'Ultimate Spellbook'],
  [1700, 'Arena'],
  [1710, 'Arena'],
  [1750, 'Arena'],
  [1900, 'URF'],
  [2300, 'Brawl'],
  [2400, 'ARAM: Mayhem'],
]);

export const QUEUE_FALLBACK_NAME = 'Other mode';

export function queueName(queueId: number): string {
  return QUEUE_NAMES.get(queueId) ?? QUEUE_FALLBACK_NAME;
}

/** The modes of Arena: 16 players in teams, ranked by place. They have a tab of their own. */
const ARENA_QUEUE_IDS: ReadonlySet<number> = new Set([1700, 1710, 1750]);

/**
 * Whether a game is an Arena game: its mode is one of Arena, or it was ranked by place (the
 * modes of Arena that the list above does not know yet give a place all the same).
 */
export function isArenaGame({
  queueId,
  placement,
}: Pick<MatchSummary, 'queueId' | 'placement'>): boolean {
  return ARENA_QUEUE_IDS.has(queueId) || placement !== null;
}
