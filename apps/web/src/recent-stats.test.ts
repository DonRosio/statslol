import { describe, expect, it } from 'vitest';

import { RECENT_GAMES, recentStats } from './recent-stats.ts';
import { matchSummary } from './test-data.ts';

/** A game with Sylas (517) unless `fields` say otherwise. */
function game(
  id: string,
  result: 'win' | 'loss' | 'remake',
  score: [number, number, number] = [5, 5, 5],
  championId = 517,
  championName = 'Sylas',
) {
  const [kills, deaths, assists] = score;
  return matchSummary(id, {
    result,
    kills,
    deaths,
    assists,
    championId,
    championName,
  });
}

describe('recentStats', () => {
  it('gives the record, the win rate and the average score', () => {
    const stats = recentStats([
      game('a', 'win', [10, 2, 8]),
      game('b', 'win', [4, 4, 6]),
      game('c', 'loss', [1, 6, 1]),
      game('d', 'win', [5, 0, 5]),
    ]);

    expect(stats).toMatchObject({
      games: 4,
      wins: 3,
      losses: 1,
      winRate: 75,
      kills: 20,
      deaths: 12,
      assists: 20,
      averageKills: 5,
      averageDeaths: 3,
      averageAssists: 5,
    });
  });

  it('rounds the win rate', () => {
    const stats = recentStats([
      game('a', 'win'),
      game('b', 'loss'),
      game('c', 'loss'),
    ]);

    expect(stats.winRate).toBe(33);
  });

  it('counts only the first 20 games, the most recent', () => {
    const matches = [
      ...Array.from({ length: RECENT_GAMES }, (_, index) =>
        game(`win${String(index)}`, 'win'),
      ),
      game('old', 'loss'),
    ];

    const stats = recentStats(matches);

    expect(stats).toMatchObject({
      games: 20,
      wins: 20,
      losses: 0,
      winRate: 100,
    });
  });

  it('leaves out a remake: it counts for nothing, and takes no place', () => {
    const matches = [
      game('remake', 'remake', [0, 0, 0]),
      ...Array.from({ length: RECENT_GAMES }, (_, index) =>
        game(`loss${String(index)}`, 'loss'),
      ),
    ];

    expect(recentStats(matches)).toMatchObject({ games: 20, wins: 0 });
  });

  it('has nothing to say about no game', () => {
    expect(recentStats([])).toMatchObject({
      games: 0,
      winRate: null,
      averageKills: 0,
      champions: [],
    });
    expect(recentStats([game('r', 'remake')]).games).toBe(0);
  });

  it('lists the 3 most played champions, with their own record and score', () => {
    const matches = [
      game('1', 'win', [10, 0, 10], 517, 'Sylas'),
      game('2', 'loss', [2, 4, 6], 517, 'Sylas'),
      game('3', 'win', [6, 2, 4], 517, 'Sylas'),
      game('4', 'loss', [1, 1, 1], 62, 'MonkeyKing'),
      game('5', 'loss', [3, 3, 3], 62, 'MonkeyKing'),
      game('6', 'win', [9, 1, 2], 90, 'Malzahar'),
      game('7', 'win', [1, 1, 1], 11, 'MasterYi'),
    ];

    const { champions } = recentStats(matches);

    expect(champions.map((champion) => champion.championName)).toEqual([
      'Sylas',
      'MonkeyKing',
      // 1 game and 1 win each: the one played most recently comes first.
      'Malzahar',
    ]);
    expect(champions[0]).toMatchObject({
      championId: 517,
      games: 3,
      wins: 2,
      losses: 1,
      winRate: 67,
      averageKills: 6,
      averageDeaths: 2,
      averageAssists: 20 / 3,
    });
  });

  it('puts first, among champions played as much, the one that won the most', () => {
    const matches = [
      game('1', 'loss', [0, 0, 0], 1, 'Annie'),
      game('2', 'win', [0, 0, 0], 2, 'Olaf'),
    ];

    expect(
      recentStats(matches).champions.map((champion) => champion.championName),
    ).toEqual(['Olaf', 'Annie']);
  });
});
