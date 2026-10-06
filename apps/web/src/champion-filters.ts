import { ARENA_QUEUE_IDS, type ChampionRecord } from '@statslol/shared';

/** The positions to choose from, in the order of the map; "all" keeps every game. */
export const ROLES = [
  { id: 'ALL', label: 'All roles' },
  { id: 'TOP', label: 'Top' },
  { id: 'JUNGLE', label: 'Jungle' },
  { id: 'MIDDLE', label: 'Mid' },
  { id: 'BOTTOM', label: 'Bot' },
  { id: 'UTILITY', label: 'Support' },
] as const;

export type RoleId = (typeof ROLES)[number]['id'];

/** The game modes to choose from. */
export const QUEUE_FILTERS = [
  // Every mode but Arena: its champions, and its games without positions or minions, would
  // blur the numbers of the usual game.
  { id: 'all', label: 'All', queueIds: null },
  { id: 'solo', label: 'Solo/Duo', queueIds: [420] },
  { id: 'normal', label: 'Normal draft', queueIds: [400] },
  { id: 'flex', label: 'Flex', queueIds: [440] },
  { id: 'arena', label: 'Arena', queueIds: [...ARENA_QUEUE_IDS] },
  { id: 'aram', label: 'ARAM', queueIds: [450] },
] as const;

export type QueueFilterId = (typeof QUEUE_FILTERS)[number]['id'];

/** The modes where a game has no position: Arena and ARAM. The roles do not apply to them. */
export function hasRoles(queue: QueueFilterId): boolean {
  return queue !== 'arena' && queue !== 'aram';
}

/** The queue IDs of a mode filter among the records. */
export function queueIdsOf(
  queue: QueueFilterId,
  records: readonly ChampionRecord[],
): ReadonlySet<number> {
  const filter = QUEUE_FILTERS.find((candidate) => candidate.id === queue);
  if (filter?.queueIds == null) {
    return new Set(
      records
        .map((record) => record.queueId)
        .filter((queueId) => !ARENA_QUEUE_IDS.has(queueId)),
    );
  }
  return new Set<number>(filter.queueIds);
}

/** Whether a champion name contains what the visitor typed, ignoring case and spaces around. */
export function matchesSearch(name: string, search: string): boolean {
  return name.toLowerCase().includes(search.trim().toLowerCase());
}
