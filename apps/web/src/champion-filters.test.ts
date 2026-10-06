import type { ChampionRecord } from '@statslol/shared';
import { describe, expect, it } from 'vitest';

import {
  matchesSearch,
  positionOptions,
  queueOptions,
} from './champion-filters.ts';

function record(fields: Partial<ChampionRecord> = {}): ChampionRecord {
  return {
    championId: 517,
    championName: 'Sylas',
    queueId: 420,
    position: 'MIDDLE',
    games: 1,
    wins: 1,
    kills: 1,
    deaths: 1,
    assists: 1,
    creepScore: 100,
    durationSeconds: 1800,
    ...fields,
  };
}

describe('queueOptions', () => {
  it('lists the modes with games, the most played first', () => {
    const options = queueOptions([
      record({ queueId: 420, games: 2 }),
      record({ queueId: 450, games: 5, position: null }),
      record({ queueId: 440, games: 2 }),
    ]);

    expect(options.map((option) => [option.name, option.games])).toEqual([
      ['ARAM', 5],
      ['Flex', 2],
      ['Solo/Duo', 2],
    ]);
  });

  it('puts the queues that share a name in one option', () => {
    const [normal, ...others] = queueOptions([
      record({ queueId: 400, games: 3 }),
      record({ queueId: 430, games: 4 }),
    ]);

    expect(others).toEqual([]);
    expect(normal?.name).toBe('Normal');
    expect(normal?.games).toBe(7);
    expect([...(normal?.queueIds ?? [])].sort()).toEqual([400, 430]);
  });

  it('lists nothing for no record', () => {
    expect(queueOptions([])).toEqual([]);
  });
});

describe('positionOptions', () => {
  it('lists the positions with games, in the order of the map, without duplicates', () => {
    expect(
      positionOptions([
        record({ position: 'UTILITY' }),
        record({ position: null }),
        record({ position: 'TOP' }),
        record({ position: 'UTILITY', queueId: 440 }),
      ]),
    ).toEqual(['TOP', 'UTILITY']);
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
