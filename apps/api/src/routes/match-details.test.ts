import type { RiotClient, RiotMatch } from '@statslol/riot-client';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { buildApp } from '../app.ts';
import { MemoryStore } from '../cache/memory-store.ts';
import { MemoryMatchStore } from '../db/memory-match-store.ts';
import { TEST_CONFIG } from '../test-config.ts';
import { fakeMatch } from '../test-matches.ts';

/** An app where Riot knows these matches, and the database none yet. */
function setUp(riotMatches: RiotMatch[] = [fakeMatch('KR_1')]) {
  const byId = new Map(
    riotMatches.map((match) => [match.metadata.matchId, match]),
  );
  const riot = {
    getAccountByRiotId: vi.fn<RiotClient['getAccountByRiotId']>(),
    getSummonerByPuuid: vi.fn<RiotClient['getSummonerByPuuid']>(),
    getLeagueEntriesByPuuid: vi.fn<RiotClient['getLeagueEntriesByPuuid']>(),
    getChampionMasteriesByPuuid: vi.fn<
      RiotClient['getChampionMasteriesByPuuid']
    >(() => Promise.resolve([])),
    getMatchIdsByPuuid: vi.fn<RiotClient['getMatchIdsByPuuid']>(),
    getMatch: vi.fn<RiotClient['getMatch']>((_platform, id) =>
      Promise.resolve(byId.get(id) ?? null),
    ),
  };
  const store = new MemoryMatchStore();
  const app = buildApp(TEST_CONFIG, {
    riot,
    cacheStore: new MemoryStore(),
    matchStore: store,
  });
  onTestFinished(() => app.close());
  const get = (path: string) => app.inject({ method: 'GET', url: path });
  return { riot, store, app, get };
}

describe('GET /api/v1/matches/:region/:matchId', () => {
  it('answers the teams of the match, with all their players', async () => {
    const { get } = setUp();

    const response = await get('/api/v1/matches/kr/KR_1');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'KR_1',
      queueId: 420,
      teams: [
        { id: 100, result: 'win', players: expect.any(Array) as unknown },
        { id: 200, result: 'loss', players: expect.any(Array) as unknown },
      ],
    });
  });

  it('reads a match it has from the database, without calling Riot', async () => {
    const { riot, store, get } = setUp();
    await store.save(fakeMatch('KR_1'), TEST_CONFIG.riotKeyGeneration);

    const response = await get('/api/v1/matches/kr/KR_1');

    expect(response.statusCode).toBe(200);
    expect(riot.getMatch).not.toHaveBeenCalled();
  });

  it('fetches a match it does not have from Riot once, then keeps it', async () => {
    const { riot, store, get } = setUp();

    await Promise.all([
      get('/api/v1/matches/kr/KR_1'),
      get('/api/v1/matches/kr/KR_1'),
    ]);
    await get('/api/v1/matches/kr/KR_1');

    expect(riot.getMatch).toHaveBeenCalledTimes(1);
    expect(riot.getMatch).toHaveBeenCalledWith('kr', 'KR_1');
    expect([...store.rows.keys()]).toEqual(['KR_1']);
  });

  it('answers 404 for a match Riot does not have', async () => {
    const { get } = setUp([]);

    const response = await get('/api/v1/matches/kr/KR_9');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ message: 'No match with this ID' });
  });

  it('answers 400 for the match of another server, without calling Riot', async () => {
    const { riot, get } = setUp([fakeMatch('EUW1_1')]);

    const response = await get('/api/v1/matches/kr/EUW1_1');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: 'This match was not played on this server',
    });
    expect(riot.getMatch).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown region', '/api/v1/matches/xx/KR_1'],
    ['a lower case ID', '/api/v1/matches/kr/kr_1'],
    ['an ID without a number', '/api/v1/matches/kr/KR_abc'],
    ['an ID that is a path', '/api/v1/matches/kr/KR_1%2F..%2Fadmin'],
  ])('answers 400 for %s, without calling Riot', async (_case, url) => {
    const { riot, get } = setUp();

    const response = await get(url);

    expect(response.statusCode).toBe(400);
    expect(riot.getMatch).not.toHaveBeenCalled();
  });

  it('answers 429 beyond 30 requests per minute from the same address', async () => {
    const { get } = setUp();

    for (let request = 1; request <= 30; request++) {
      expect((await get('/api/v1/matches/kr/KR_1')).statusCode).toBe(200);
    }
    const response = await get('/api/v1/matches/kr/KR_1');

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('60');
  });
});
