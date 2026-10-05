import type { RiotClient, RiotLeagueEntry } from '@statslol/riot-client';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { buildApp } from '../app.ts';
import { MemoryStore } from '../cache/memory-store.ts';
import { MemoryMatchStore } from '../db/memory-match-store.ts';
import { TEST_CONFIG } from '../test-config.ts';
import { fakeMatch } from '../test-matches.ts';

const SOLO: RiotLeagueEntry = {
  queueType: 'RANKED_SOLO_5x5',
  tier: 'DIAMOND',
  rank: 'I',
  leaguePoints: 59,
  wins: 23,
  losses: 26,
};

function setUp() {
  const riot = {
    getAccountByRiotId: vi.fn<RiotClient['getAccountByRiotId']>(),
    getSummonerByPuuid: vi.fn<RiotClient['getSummonerByPuuid']>(),
    getLeagueEntriesByPuuid: vi.fn<RiotClient['getLeagueEntriesByPuuid']>(() =>
      Promise.resolve([SOLO]),
    ),
    getMatchIdsByPuuid: vi.fn<RiotClient['getMatchIdsByPuuid']>(),
    getMatch: vi.fn<RiotClient['getMatch']>((_platform, id) =>
      Promise.resolve(id === 'KR_1' ? fakeMatch('KR_1') : null),
    ),
  };
  const app = buildApp(TEST_CONFIG, {
    riot,
    cacheStore: new MemoryStore(),
    matchStore: new MemoryMatchStore(),
  });
  onTestFinished(() => app.close());
  const get = (path: string) => app.inject({ method: 'GET', url: path });
  return { riot, get };
}

describe('GET /api/v1/matches/:region/:matchId/ranks', () => {
  it('answers the solo rank of each player of the match', async () => {
    const { get } = setUp();

    const response = await get('/api/v1/matches/kr/KR_1/ranks');

    expect(response.statusCode).toBe(200);
    const { ranks } = response.json<{ ranks: Record<string, unknown> }>();
    expect(Object.keys(ranks)).toHaveLength(10);
    expect(ranks['1']).toMatchObject({ tier: 'DIAMOND', division: 'I' });
    // The PUUIDs stay on the server.
    expect(response.body).not.toContain('puuid');
  });

  it('asks Riot only once for a player whose rank was asked a moment ago', async () => {
    const { riot, get } = setUp();

    await get('/api/v1/matches/kr/KR_1/ranks');
    await get('/api/v1/matches/kr/KR_1/ranks');

    expect(riot.getLeagueEntriesByPuuid).toHaveBeenCalledTimes(10);
  });

  it('answers 404 for a match Riot does not have', async () => {
    const { get } = setUp();

    const response = await get('/api/v1/matches/kr/KR_9/ranks');

    expect(response.statusCode).toBe(404);
  });

  it('answers 400 for the match of another server, without calling Riot', async () => {
    const { riot, get } = setUp();

    const response = await get('/api/v1/matches/kr/EUW1_1/ranks');

    expect(response.statusCode).toBe(400);
    expect(riot.getMatch).not.toHaveBeenCalled();
    expect(riot.getLeagueEntriesByPuuid).not.toHaveBeenCalled();
  });

  it('answers 429 beyond 20 requests per minute from the same address', async () => {
    const { get } = setUp();

    for (let request = 1; request <= 20; request++) {
      expect((await get('/api/v1/matches/kr/KR_1/ranks')).statusCode).toBe(200);
    }
    const response = await get('/api/v1/matches/kr/KR_1/ranks');

    expect(response.statusCode).toBe(429);
  });
});
