import type {
  RiotAccount,
  RiotChampionMastery,
  RiotClient,
} from '@statslol/riot-client';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { buildApp } from '../app.ts';
import { MemoryStore } from '../cache/memory-store.ts';
import { MemoryMatchStore } from '../db/memory-match-store.ts';
import { TEST_CONFIG } from '../test-config.ts';
import { PLAYER_PUUID } from '../test-matches.ts';

const ACCOUNT: RiotAccount = {
  puuid: PLAYER_PUUID,
  gameName: 'Hide on bush',
  tagLine: 'KR1',
};

const MASTERY = '/api/v1/players/euw/Hide%20on%20bush/KR1/mastery';

function mastery(fields: Partial<RiotChampionMastery>): RiotChampionMastery {
  return {
    championId: 517,
    championLevel: 10,
    championPoints: 1000,
    lastPlayTime: Date.UTC(2026, 9, 1, 10, 11, 11),
    championPointsSinceLastLevel: 100,
    championPointsUntilNextLevel: 900,
    ...fields,
  };
}

function setUp(masteries: RiotChampionMastery[]) {
  const riot = {
    getAccountByRiotId: vi.fn<RiotClient['getAccountByRiotId']>(() =>
      Promise.resolve(ACCOUNT),
    ),
    getChampionMasteriesByPuuid: vi.fn<
      RiotClient['getChampionMasteriesByPuuid']
    >(() => Promise.resolve(masteries)),
  };
  const app = buildApp(TEST_CONFIG, {
    riot: riot as unknown as RiotClient,
    cacheStore: new MemoryStore(),
    matchStore: new MemoryMatchStore(),
  });
  onTestFinished(() => app.close());
  return { riot, app };
}

describe('GET /api/v1/players/:region/:name/:tag/mastery', () => {
  it('answers the champions, the most points first, with the totals', async () => {
    const { riot, app } = setUp([
      mastery({ championId: 1, championLevel: 5, championPoints: 5000 }),
      mastery({ championId: 2, championLevel: 32, championPoints: 324_704 }),
      mastery({ championId: 3, championLevel: 7, championPoints: 20_000 }),
    ]);

    const response = await app.inject({ method: 'GET', url: MASTERY });

    expect(response.statusCode).toBe(200);
    expect(riot.getChampionMasteriesByPuuid).toHaveBeenCalledWith(
      'euw1',
      PLAYER_PUUID,
    );
    const body = response.json<{
      score: number;
      totalPoints: number;
      champions: { championId: number; level: number }[];
    }>();
    expect(body.champions.map((champion) => champion.championId)).toEqual([
      2, 3, 1,
    ]);
    expect(body.score).toBe(44);
    expect(body.totalPoints).toBe(349_704);
    expect(body.champions[0]).toEqual({
      championId: 2,
      level: 32,
      points: 324_704,
      lastPlayedAt: '2026-10-01T10:11:11.000Z',
      pointsSinceLastLevel: 100,
      pointsUntilNextLevel: 900,
    });
  });

  it('has no date for a champion Riot gives none for, and no negative points', async () => {
    const { app } = setUp([
      mastery({ lastPlayTime: 0, championPointsUntilNextLevel: -40 }),
    ]);

    const response = await app.inject({ method: 'GET', url: MASTERY });

    expect(
      response.json<{ champions: unknown[] }>().champions[0],
    ).toMatchObject({ lastPlayedAt: null, pointsUntilNextLevel: 0 });
  });

  it('answers an empty list for a player with no mastery', async () => {
    const { app } = setUp([]);

    const response = await app.inject({ method: 'GET', url: MASTERY });

    expect(response.json()).toEqual({
      score: 0,
      totalPoints: 0,
      champions: [],
    });
  });

  it('keeps the answer for the next visits: one call to Riot', async () => {
    const { riot, app } = setUp([mastery({})]);

    await app.inject({ method: 'GET', url: MASTERY });
    await app.inject({ method: 'GET', url: MASTERY });

    expect(riot.getChampionMasteriesByPuuid).toHaveBeenCalledTimes(1);
  });

  it('answers 404 when no account has this Riot ID', async () => {
    const { riot, app } = setUp([]);
    riot.getAccountByRiotId.mockResolvedValue(null);

    const response = await app.inject({ method: 'GET', url: MASTERY });

    expect(response.statusCode).toBe(404);
    expect(riot.getChampionMasteriesByPuuid).not.toHaveBeenCalled();
  });

  it('answers 400 for an invalid region', async () => {
    const { riot, app } = setUp([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/players/nowhere/Hide%20on%20bush/KR1/mastery',
    });

    expect(response.statusCode).toBe(400);
    expect(riot.getAccountByRiotId).not.toHaveBeenCalled();
  });
});
