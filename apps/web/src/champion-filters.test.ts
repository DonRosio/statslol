import type { ChampionRecord } from '@statslol/shared';
import { describe, expect, it } from 'vitest';

import {
  hasRoles,
  matchesSearch,
  queueIdsOf,
  QUEUE_FILTERS,
  ROLES,
} from './champion-filters.ts';

function record(queueId: number): ChampionRecord {
  return {
    championId: 517,
    championName: 'Sylas',
    queueId,
    position: 'MIDDLE',
    games: 1,
    wins: 1,
    kills: 1,
    deaths: 1,
    assists: 1,
    creepScore: 100,
    durationSeconds: 1800,
    placementSum: 0,
  };
}

describe('the choices', () => {
  it('are the roles of the map after "all roles"', () => {
    expect(ROLES.map((role) => role.id)).toEqual([
      'ALL',
      'TOP',
      'JUNGLE',
      'MIDDLE',
      'BOTTOM',
      'UTILITY',
    ]);
  });

  it('are the modes of the page, "all" first', () => {
    expect(QUEUE_FILTERS.map((queue) => queue.label)).toEqual([
      'All',
      'Solo/Duo',
      'Normal draft',
      'Flex',
      'Arena',
      'ARAM',
    ]);
  });
});

describe('hasRoles', () => {
  it.each([
    ['all', true],
    ['solo', true],
    ['normal', true],
    ['flex', true],
    ['arena', false],
    ['aram', false],
  ] as const)('%s: %s', (queue, expected) => {
    expect(hasRoles(queue)).toBe(expected);
  });
});

describe('queueIdsOf', () => {
  const records = [record(420), record(430), record(450), record(1700)];

  it('is every mode but Arena for "all": the ones the records have', () => {
    expect([...queueIdsOf('all', records)].sort()).toEqual([420, 430, 450]);
  });

  it.each([
    ['solo', [420]],
    ['normal', [400]],
    ['flex', [440]],
    ['aram', [450]],
    ['arena', [1700, 1710, 1750]],
  ] as const)('is the queues of %s', (queue, queueIds) => {
    expect([...queueIdsOf(queue, records)].sort()).toEqual(queueIds);
  });
});

describe('matchesSearch', () => {
  it.each([
    ['Wukong', 'wuk', true],
    ['Wukong', '  KONG ', true],
    ['Wukong', '', true],
    ["Kai'Sa", "kai'", true],
    ['Wukong', 'lux', false],
  ])('%s with "%s": %s', (name, search, expected) => {
    expect(matchesSearch(name, search)).toBe(expected);
  });
});
