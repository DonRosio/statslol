import type { ChampionRecord } from '@statslol/shared';

import { queueName } from './queues.ts';

/** The game modes the records have games in, to choose from. */
export interface QueueOption {
  /** What the visitor reads: Riot has several queues under one name ("Normal"). */
  readonly name: string;
  readonly queueIds: ReadonlySet<number>;
  readonly games: number;
}

/** The modes of the records, the most played first; between two of them, by name. */
export function queueOptions(
  records: readonly ChampionRecord[],
): QueueOption[] {
  const options = new Map<string, { queueIds: Set<number>; games: number }>();
  for (const { queueId, games } of records) {
    const name = queueName(queueId);
    const option = options.get(name) ?? { queueIds: new Set(), games: 0 };
    option.queueIds.add(queueId);
    option.games += games;
    options.set(name, option);
  }
  return [...options.entries()]
    .map(([name, option]) => ({ name, ...option }))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
}

/** Riot's positions, in the order of the map: from the top lane to the support. */
const POSITION_ORDER = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

/** The positions the records have games in, in the order of the map. */
export function positionOptions(records: readonly ChampionRecord[]): string[] {
  const present = new Set(records.map((record) => record.position));
  return POSITION_ORDER.filter((position) => present.has(position));
}

/** Whether a champion name contains what the visitor typed, ignoring case and spaces around. */
export function matchesSearch(name: string, search: string): boolean {
  return name.toLowerCase().includes(search.trim().toLowerCase());
}
