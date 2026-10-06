import type { RiotAccount, RiotClient } from '@statslol/riot-client';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { buildApp } from '../app.ts';
import { MemoryStore } from '../cache/memory-store.ts';
import { MemoryMatchStore } from '../db/memory-match-store.ts';
import { TEST_CONFIG } from '../test-config.ts';
import { fakeMatch, PLAYER_PUUID } from '../test-matches.ts';

const ACCOUNT: RiotAccount = {
  puuid: PLAYER_PUUID,
  gameName: 'Hide on bush',
  tagLine: 'KR1',
};

const CHAMPIONS = '/api/v1/players/kr/Hide%20on%20bush/KR1/champions';
// The test matches started on 3 October 2026: in Season 16.
const SEASON = `${CHAMPIONS}?season=2026`;

/** An app whose database holds these matches (stored with the key generation of the config). */
async function setUp(matches: ReturnType<typeof fakeMatch>[]) {
  const store = new MemoryMatchStore();
  for (const match of matches) {
    await store.save(match, TEST_CONFIG.riotKeyGeneration);
  }
  const riot = {
    getAccountByRiotId: vi.fn<RiotClient['getAccountByRiotId']>(() =>
      Promise.resolve(ACCOUNT),
    ),
    getMatch: vi.fn<RiotClient['getMatch']>(() => Promise.resolve(null)),
  };
  const app = buildApp(TEST_CONFIG, {
    // Only these two calls are faked: any other one makes the test fail.
    riot: riot as unknown as RiotClient,
    cacheStore: new MemoryStore(),
    matchStore: store,
  });
  onTestFinished(() => app.close());
  return { riot, app };
}

/** A match of the player as another champion, in a given mode. */
function match(
  id: string,
  queueId: number,
  player: Parameters<typeof fakeMatch>[1] = {},
) {
  const base = fakeMatch(id, player);
  return { ...base, info: { ...base.info, queueId } };
}

describe('GET /api/v1/players/:region/:name/:tag/champions', () => {
  it('adds up the stored matches of the season, by champion, mode and position', async () => {
    const { app } = await setUp([
      match('KR_1', 420),
      match('KR_2', 420, { win: false, kills: 1, deaths: 5, assists: 2 }),
      match('KR_3', 450, {
        teamPosition: '',
        championId: 99,
        championName: 'Lux',
      }),
    ]);

    const response = await app.inject({ method: 'GET', url: SEASON });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ season: string }>().season).toBe('2026');
    expect(response.json<{ records: unknown[] }>().records).toEqual([
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
        creepScore: 384,
        durationSeconds: 3668,
        placementSum: 0,
      },
      {
        championId: 99,
        championName: 'Lux',
        queueId: 450,
        position: null,
        games: 1,
        wins: 1,
        kills: 7,
        deaths: 2,
        assists: 9,
        creepScore: 192,
        durationSeconds: 1834,
        placementSum: 0,
      },
    ]);
  });

  it('leaves out the remakes, and counts the Arena games with their place', async () => {
    const { app } = await setUp([
      match('KR_1', 420, { gameEndedInEarlySurrender: true }),
      match('KR_2', 1700, { placement: 2, teamPosition: '' }),
      match('KR_3', 1700, { placement: 5, teamPosition: '' }),
      match('KR_4', 420),
    ]);

    const response = await app.inject({ method: 'GET', url: SEASON });

    expect(
      response
        .json<{
          records: { queueId: number; games: number; placementSum: number }[];
        }>()
        .records.map(({ queueId, games, placementSum }) => [
          queueId,
          games,
          placementSum,
        ]),
    ).toEqual([
      [1700, 2, 7],
      [420, 1, 0],
    ]);
  });

  it('leaves out the matches before the season', async () => {
    const before = match('KR_1', 420);
    const { app } = await setUp([
      {
        ...before,
        info: {
          ...before.info,
          gameStartTimestamp: Date.UTC(2025, 11, 31),
        },
      },
      match('KR_2', 420),
    ]);

    const response = await app.inject({ method: 'GET', url: SEASON });

    expect(
      response.json<{ records: { games: number }[] }>().records[0]?.games,
    ).toBe(1);
  });

  it('answers the season in progress when none is asked', async () => {
    const { app } = await setUp([match('KR_1', 420)]);

    const response = await app.inject({ method: 'GET', url: CHAMPIONS });

    expect(response.json<{ season: string }>().season).toBe('2026');
  });

  it.each(['2026-3', '2027', 'x'])(
    'answers 400 for the season %s, without calling Riot',
    async (season) => {
      const { riot, app } = await setUp([]);

      const response = await app.inject({
        method: 'GET',
        url: `${CHAMPIONS}?season=${season}`,
      });

      expect(response.statusCode).toBe(400);
      expect(riot.getAccountByRiotId).not.toHaveBeenCalled();
    },
  );

  it('leaves out the matches of other players, and answers nothing for no match', async () => {
    const other = fakeMatch('KR_1');
    const { app } = await setUp([
      {
        ...other,
        metadata: { ...other.metadata, participants: ['someone-else'] },
      },
    ]);

    const response = await app.inject({ method: 'GET', url: SEASON });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ season: '2026', records: [] });
  });

  it('never calls Riot for a match', async () => {
    const { riot, app } = await setUp([match('KR_1', 420)]);

    await app.inject({ method: 'GET', url: SEASON });

    expect(riot.getMatch).not.toHaveBeenCalled();
  });

  it('answers 404 when no account has this Riot ID', async () => {
    const { riot, app } = await setUp([]);
    riot.getAccountByRiotId.mockResolvedValue(null);

    const response = await app.inject({ method: 'GET', url: SEASON });

    expect(response.statusCode).toBe(404);
  });

  it('answers 400 for an invalid region', async () => {
    const { riot, app } = await setUp([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/players/nowhere/Hide%20on%20bush/KR1/champions',
    });

    expect(response.statusCode).toBe(400);
    expect(riot.getAccountByRiotId).not.toHaveBeenCalled();
  });
});
