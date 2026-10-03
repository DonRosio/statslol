import type { RiotAccount, RiotClient, RiotMatch } from '@statslol/riot-client';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

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

const PLAYER = '/api/v1/players/kr/Hide%20on%20bush/KR1';

/** An app whose Riot knows these matches of the player, the most recent first. */
function setUp(
  riotMatches: RiotMatch[] = [fakeMatch('KR_2'), fakeMatch('KR_1')],
) {
  const byId = new Map(
    riotMatches.map((match) => [match.metadata.matchId, match]),
  );
  const riot = {
    getAccountByRiotId: vi.fn<RiotClient['getAccountByRiotId']>(() =>
      Promise.resolve(ACCOUNT),
    ),
    getSummonerByPuuid: vi.fn<RiotClient['getSummonerByPuuid']>(() =>
      Promise.resolve({
        puuid: PLAYER_PUUID,
        profileIconId: 6,
        summonerLevel: 800,
      }),
    ),
    getLeagueEntriesByPuuid: vi.fn<RiotClient['getLeagueEntriesByPuuid']>(() =>
      Promise.resolve([]),
    ),
    getMatchIdsByPuuid: vi.fn<RiotClient['getMatchIdsByPuuid']>(
      (_platform, _puuid, { start, count }) =>
        Promise.resolve([...byId.keys()].slice(start, start + count)),
    ),
    getMatch: vi.fn<RiotClient['getMatch']>((_platform, id) =>
      Promise.resolve(byId.get(id) ?? null),
    ),
  };
  const app = buildApp(TEST_CONFIG, {
    riot,
    cacheStore: new MemoryStore(),
    matchStore: new MemoryMatchStore(),
  });
  onTestFinished(() => app.close());
  return { riot, app };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/v1/players/:region/:name/:tag/matches', () => {
  it('answers the first page of the history', async () => {
    const { app } = setUp();

    const response = await app.inject({
      method: 'GET',
      url: `${PLAYER}/matches`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matches: [{ id: 'KR_2', result: 'win' }, { id: 'KR_1' }],
      nextStart: null,
    });
  });

  it('answers the page that starts at `start`', async () => {
    const { riot, app } = setUp();

    await app.inject({ method: 'GET', url: `${PLAYER}/matches?start=10` });

    expect(riot.getMatchIdsByPuuid).toHaveBeenCalledWith('kr', PLAYER_PUUID, {
      start: 10,
      count: 10,
    });
  });

  it.each(['-1', '1.5', 'abc', '1001'])(
    'answers 400 for start=%s, without calling Riot',
    async (start) => {
      const { riot, app } = setUp();

      const response = await app.inject({
        method: 'GET',
        url: `${PLAYER}/matches?start=${start}`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<{ message: string }>().message).toContain('start');
      expect(riot.getAccountByRiotId).not.toHaveBeenCalled();
    },
  );

  it('answers 404 when no account has this Riot ID', async () => {
    const { riot, app } = setUp();
    riot.getAccountByRiotId.mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: `${PLAYER}/matches`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('can be linked to from another website', async () => {
    const { app } = setUp();

    const response = await app.inject({
      method: 'GET',
      url: `${PLAYER}/matches`,
      headers: { 'sec-fetch-site': 'cross-site' },
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('POST /api/v1/players/:region/:name/:tag/refresh', () => {
  function refresh(
    app: ReturnType<typeof setUp>['app'],
    options: { headers?: Record<string, string>; remoteAddress?: string } = {},
  ) {
    return app.inject({ method: 'POST', url: `${PLAYER}/refresh`, ...options });
  }

  it('answers 204, and the next lookups of the player ask Riot again', async () => {
    const { riot, app } = setUp();
    const lookUp = async () => {
      await app.inject({ method: 'GET', url: PLAYER });
      await app.inject({ method: 'GET', url: `${PLAYER}/matches` });
    };
    await lookUp();
    await lookUp();
    expect(riot.getSummonerByPuuid).toHaveBeenCalledTimes(1);

    const response = await refresh(app);
    await lookUp();

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(riot.getSummonerByPuuid).toHaveBeenCalledTimes(2);
    expect(riot.getLeagueEntriesByPuuid).toHaveBeenCalledTimes(2);
    expect(riot.getMatchIdsByPuuid).toHaveBeenCalledTimes(2);
    // Stored matches are not fetched again: a finished match never changes.
    expect(riot.getMatch).toHaveBeenCalledTimes(2);
  });

  it('answers 429 to a refresh less than 2 minutes after the previous one, whoever asks', async () => {
    const { app } = setUp();

    expect((await refresh(app)).statusCode).toBe(204);
    const response = await refresh(app, { remoteAddress: '203.0.113.7' });

    expect(response.statusCode).toBe(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(110);
    expect(Number(response.headers['retry-after'])).toBeLessThanOrEqual(120);
    expect(response.json()).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'This player was updated less than 2 minutes ago',
    });
  });

  it('refreshes the player again once the 2 minutes are over', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { app } = setUp();

    expect((await refresh(app)).statusCode).toBe(204);
    vi.advanceTimersByTime(119_000);
    expect((await refresh(app)).statusCode).toBe(429);
    vi.advanceTimersByTime(1000);
    expect((await refresh(app)).statusCode).toBe(204);
  });

  it('answers 404 when no account has this Riot ID', async () => {
    const { riot, app } = setUp();
    riot.getAccountByRiotId.mockResolvedValue(null);

    expect((await refresh(app)).statusCode).toBe(404);
  });

  it('accepts requests from the site itself', async () => {
    const { app } = setUp();

    const response = await refresh(app, {
      headers: { 'sec-fetch-site': 'same-origin' },
    });

    expect(response.statusCode).toBe(204);
  });

  // Another site of the same domain (e.g. another subdomain) is another website too.
  it.each(['cross-site', 'same-site'])(
    'refuses requests sent from another website (%s)',
    async (site) => {
      const { riot, app } = setUp();

      const response = await refresh(app, {
        headers: { 'sec-fetch-site': site },
      });

      expect(response.statusCode).toBe(403);
      expect(riot.getAccountByRiotId).not.toHaveBeenCalled();
    },
  );
});
