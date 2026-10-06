import { describe, expect, it } from 'vitest';

import {
  championRecords,
  championStats,
  type ChampionGame,
} from './champion-stats.ts';

/** A won ranked game as Sylas in the middle lane, unless the fields say otherwise. */
function game(fields: Partial<ChampionGame> = {}): ChampionGame {
  return {
    queueId: 420,
    championId: 517,
    championName: 'Sylas',
    position: 'MIDDLE',
    result: 'win',
    kills: 7,
    deaths: 2,
    assists: 9,
    creepScore: 180,
    durationSeconds: 1800,
    ...fields,
  };
}

describe('championRecords', () => {
  it('adds up the games of a champion in the same mode and position', () => {
    const records = championRecords([
      game(),
      game({
        result: 'loss',
        kills: 1,
        deaths: 5,
        assists: 2,
        creepScore: 100,
      }),
    ]);

    expect(records).toEqual([
      {
        championId: 517,
        championName: 'Sylas',
        queueId: 420,
        position: 'MIDDLE',
        games: 2,
        wins: 1,
        kills: 8,
        deaths: 7,
        assists: 11,
        creepScore: 280,
        durationSeconds: 3600,
      },
    ]);
  });

  it('keeps apart the modes and the positions of a champion', () => {
    const records = championRecords([
      game(),
      game({ queueId: 440 }),
      game({ position: 'TOP' }),
      game({ queueId: 450, position: null }),
      game({ queueId: 450, position: null }),
    ]);

    expect(records.map((r) => [r.queueId, r.position, r.games])).toEqual([
      [420, 'MIDDLE', 1],
      [440, 'MIDDLE', 1],
      [420, 'TOP', 1],
      [450, null, 2],
    ]);
  });

  it('leaves out the remakes', () => {
    expect(championRecords([game({ result: 'remake' })])).toEqual([]);
  });
});

describe('championStats', () => {
  const records = championRecords([
    game(),
    game({ result: 'loss', kills: 1, deaths: 5, assists: 2, creepScore: 100 }),
    game({ queueId: 440, position: 'TOP', result: 'loss', deaths: 0 }),
    game({ championId: 99, championName: 'Lux', position: 'UTILITY' }),
    game({ championId: 99, championName: 'Lux', position: 'UTILITY' }),
    game({ championId: 99, championName: 'Lux', position: 'UTILITY' }),
  ]);

  it('adds up the records of each champion, the most played first', () => {
    const [lux, sylas] = championStats(records);

    expect(lux).toMatchObject({
      championId: 99,
      games: 3,
      wins: 3,
      losses: 0,
      winRate: 100,
    });
    expect(sylas).toMatchObject({
      championId: 517,
      championName: 'Sylas',
      games: 3,
      wins: 1,
      losses: 2,
      winRate: 33,
      kills: 15,
      deaths: 7,
      assists: 20,
      creepScore: 460,
      durationSeconds: 5400,
    });
    expect(sylas?.averageKills).toBeCloseTo(5);
    expect(sylas?.averageCreepScore).toBeCloseTo(153.33, 2);
  });

  it('keeps only the modes of the filter', () => {
    const stats = championStats(records, { queueIds: new Set([440]) });

    expect(stats.map((s) => [s.championId, s.games])).toEqual([[517, 1]]);
  });

  it('keeps only the position of the filter', () => {
    const stats = championStats(records, { position: 'UTILITY' });

    expect(stats.map((s) => [s.championId, s.games])).toEqual([[99, 3]]);
  });

  it('breaks a tie by the wins, then by name', () => {
    const tied = championRecords([
      game({ championId: 1, championName: 'Annie', result: 'loss' }),
      game({ championId: 2, championName: 'Zed' }),
      game({ championId: 3, championName: 'Ahri' }),
    ]);

    expect(championStats(tied).map((s) => s.championName)).toEqual([
      'Ahri',
      'Zed',
      'Annie',
    ]);
  });

  it('says nothing for no record', () => {
    expect(championStats([])).toEqual([]);
  });
});
