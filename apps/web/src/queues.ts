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
