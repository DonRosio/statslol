import {
  RiotApiError,
  type RiotAccount,
  type RiotApiErrorKind,
  type RiotClient,
  type RiotLeagueEntry,
  type RiotSummoner,
} from '@statslol/riot-client';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { buildApp } from '../app.ts';
import { MemoryStore } from '../cache/memory-store.ts';
import { MemoryMatchStore } from '../db/memory-match-store.ts';
import { TEST_CONFIG as config } from '../test-config.ts';

/** New, empty stores: each test starts without cache and without stored matches. */
function emptyStores() {
  return { cacheStore: new MemoryStore(), matchStore: new MemoryMatchStore() };
}

const ACCOUNT: RiotAccount = {
  puuid: 'fake-puuid'.padEnd(78, '0'),
  gameName: 'Hide on bush',
  tagLine: 'KR1',
};
const SUMMONER: RiotSummoner = {
  puuid: ACCOUNT.puuid,
  profileIconId: 6,
  summonerLevel: 800,
};
const SOLO: RiotLeagueEntry = {
  queueType: 'RANKED_SOLO_5x5',
  tier: 'CHALLENGER',
  rank: 'I',
  leaguePoints: 1234,
  wins: 300,
  losses: 250,
};
const FLEX: RiotLeagueEntry = {
  queueType: 'RANKED_FLEX_SR',
  tier: 'DIAMOND',
  rank: 'II',
  leaguePoints: 59,
  wins: 23,
  losses: 26,
};
const PREMADE: RiotLeagueEntry = {
  ...FLEX,
  queueType: 'RANKED_PREMADE_5x5',
  rank: 'IV',
};

/** A Riot client that answers without any network call. */
function fakeRiot() {
  return {
    getAccountByRiotId: vi.fn<RiotClient['getAccountByRiotId']>(() =>
      Promise.resolve(ACCOUNT),
    ),
    getSummonerByPuuid: vi.fn<RiotClient['getSummonerByPuuid']>(() =>
      Promise.resolve(SUMMONER),
    ),
    getLeagueEntriesByPuuid: vi.fn<RiotClient['getLeagueEntriesByPuuid']>(() =>
      Promise.resolve([SOLO, FLEX, PREMADE]),
    ),
    getMatchIdsByPuuid: vi.fn<RiotClient['getMatchIdsByPuuid']>(() =>
      Promise.resolve([]),
    ),
    getMatch: vi.fn<RiotClient['getMatch']>(() => Promise.resolve(null)),
  };
}

/** Sends GET /api/v1/players/<path> to an app that uses this Riot client. */
function getPlayer(riot: RiotClient, path: string) {
  const app = buildApp(config, { riot, ...emptyStores() });
  onTestFinished(() => app.close());
  return app.inject({ method: 'GET', url: `/api/v1/players/${path}` });
}

describe('GET /api/v1/players/:region/:name/:tag', () => {
  it('answers the profile, with the Riot ID written the way its owner chose', async () => {
    const response = await getPlayer(fakeRiot(), 'kr/hide%20on%20bush/kr1');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      riotId: { gameName: 'Hide on bush', tagLine: 'KR1' },
      region: 'kr',
      profileIconId: 6,
      summonerLevel: 800,
      ranks: {
        solo: {
          tier: 'CHALLENGER',
          division: null,
          leaguePoints: 1234,
          wins: 300,
          losses: 250,
        },
        flex: {
          tier: 'DIAMOND',
          division: 'II',
          leaguePoints: 59,
          wins: 23,
          losses: 26,
        },
      },
    });
  });

  it('asks Riot with the cleaned-up Riot ID, on the platform of the region', async () => {
    const riot = fakeRiot();

    await getPlayer(riot, 'euw/%20Hide%20on%20bush%20/KR1');

    expect(riot.getAccountByRiotId).toHaveBeenCalledWith({
      gameName: 'Hide on bush',
      tagLine: 'KR1',
    });
    expect(riot.getSummonerByPuuid).toHaveBeenCalledWith('euw1', ACCOUNT.puuid);
    expect(riot.getLeagueEntriesByPuuid).toHaveBeenCalledWith(
      'euw1',
      ACCOUNT.puuid,
    );
  });

  it('never gives out the PUUID', async () => {
    const response = await getPlayer(fakeRiot(), 'kr/Hide%20on%20bush/KR1');

    expect(response.body).not.toContain(ACCOUNT.puuid);
  });

  it('answers null for the queues where the player is not ranked', async () => {
    const riot = fakeRiot();
    riot.getLeagueEntriesByPuuid.mockResolvedValue([]);

    const response = await getPlayer(riot, 'kr/Hide%20on%20bush/KR1');

    expect(response.json()).toMatchObject({
      ranks: { solo: null, flex: null },
    });
  });

  // Fastify refuses URL parameters longer than 100 characters (measured once decoded).
  it.each([
    ['Chinese', '我'.repeat(16)],
    ['Thai', 'ที่'.repeat(16)],
  ])(
    'finds a player with one of the longest Riot IDs (16 %s characters)',
    async (_script, name) => {
      const response = await getPlayer(
        fakeRiot(),
        `tw/${encodeURIComponent(name)}/TW2`,
      );

      expect(response.statusCode).toBe(200);
    },
  );

  it('answers 404 when no account has this Riot ID', async () => {
    const riot = fakeRiot();
    riot.getAccountByRiotId.mockResolvedValue(null);

    const response = await getPlayer(riot, 'euw/Nobody%20Here/EUW');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'No player with this Riot ID on this region',
    });
  });

  it('answers 404 when the account never played on this region', async () => {
    const riot = fakeRiot();
    riot.getSummonerByPuuid.mockResolvedValue(null);

    const response = await getPlayer(riot, 'euw/Hide%20on%20bush/KR1');

    expect(response.statusCode).toBe(404);
  });

  it.each([
    ['an unknown region', 'xx/Hide%20on%20bush/KR1', 'region'],
    ['a name too short', 'kr/ab/KR1', 'name'],
    ['a name with a slash', 'kr/a%2Fb%2Fc/KR1', 'name'],
    ['a tag too long', 'kr/Hide%20on%20bush/KR1234', 'tag'],
  ])('answers 400 for %s, without calling Riot', async (_case, path, field) => {
    const riot = fakeRiot();

    const response = await getPlayer(riot, path);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'Bad Request' });
    expect(response.json<{ message: string }>().message).toContain(field);
    expect(riot.getAccountByRiotId).not.toHaveBeenCalled();
  });

  it.each<[RiotApiErrorKind, number]>([
    ['rate-limited', 503],
    ['unavailable', 502],
    ['timeout', 504],
    ['unauthorized', 503],
    ['unexpected-response', 502],
  ])(
    'answers a "%s" Riot failure with a %i, without its details',
    async (kind, statusCode) => {
      const riot = fakeRiot();
      riot.getAccountByRiotId.mockRejectedValue(
        new RiotApiError(kind, 'internal detail: the API key expired'),
      );

      const response = await getPlayer(riot, 'kr/Hide%20on%20bush/KR1');

      expect(response.statusCode).toBe(statusCode);
      expect(response.body).not.toContain('internal detail');
    },
  );

  it('passes on the delay Riot asks to wait', async () => {
    const riot = fakeRiot();
    riot.getAccountByRiotId.mockRejectedValue(
      new RiotApiError('rate-limited', 'Rate limit', { retryAfterSeconds: 7 }),
    );

    const response = await getPlayer(riot, 'kr/Hide%20on%20bush/KR1');

    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('7');
  });

  it('answers a rank it does not know as an unexpected answer from Riot', async () => {
    const riot = fakeRiot();
    riot.getLeagueEntriesByPuuid.mockResolvedValue([{ ...SOLO, tier: 'WOOD' }]);

    const response = await getPlayer(riot, 'kr/Hide%20on%20bush/KR1');

    expect(response.statusCode).toBe(502);
  });
});

describe('limits and unexpected errors', () => {
  it('answers 429 beyond 20 lookups per minute from the same address', async () => {
    const app = buildApp(config, { riot: fakeRiot(), ...emptyStores() });
    onTestFinished(() => app.close());
    const lookUp = () =>
      app.inject({
        method: 'GET',
        url: '/api/v1/players/kr/Hide%20on%20bush/KR1',
      });

    for (let request = 1; request <= 20; request++) {
      expect((await lookUp()).statusCode).toBe(200);
    }
    const response = await lookUp();

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('60');
    expect(response.json()).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
    });
  });

  it('answers an unexpected error without its details, which go to the logs', async () => {
    const lines: string[] = [];
    const riot = fakeRiot();
    riot.getAccountByRiotId.mockRejectedValue(
      new TypeError("Cannot read properties of undefined (reading 'puuid')"),
    );
    const app = buildApp(
      { ...config, logLevel: 'error' },
      {
        riot,
        ...emptyStores(),
        logStream: { write: (line) => lines.push(line) },
      },
    );
    onTestFinished(() => app.close());

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/players/kr/Hide%20on%20bush/KR1',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
    // The message and the stack trace are in the logs, for us.
    const logs = lines.join('');
    expect(logs).toContain("reading 'puuid'");
    expect(logs).toContain('"stack":"TypeError: Cannot read properties');
  });
});

describe('cache', () => {
  const url = '/api/v1/players/kr/Hide%20on%20bush/KR1';

  function createApp(riot: RiotClient) {
    const app = buildApp(config, { riot, ...emptyStores() });
    onTestFinished(() => app.close());
    return app;
  }

  function expectOneCallPerEndpoint(riot: ReturnType<typeof fakeRiot>) {
    expect(riot.getAccountByRiotId).toHaveBeenCalledTimes(1);
    expect(riot.getSummonerByPuuid).toHaveBeenCalledTimes(1);
    expect(riot.getLeagueEntriesByPuuid).toHaveBeenCalledTimes(1);
  }

  it('answers a player looked up again from the cache, without calling Riot', async () => {
    const riot = fakeRiot();
    const app = createApp(riot);

    const first = await app.inject({ method: 'GET', url });
    const second = await app.inject({ method: 'GET', url });

    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expectOneCallPerEndpoint(riot);
  });

  it('sends a single set of calls to Riot for simultaneous lookups of a player', async () => {
    const riot = fakeRiot();
    const app = createApp(riot);

    const responses = await Promise.all(
      [1, 2, 3].map(() => app.inject({ method: 'GET', url })),
    );

    expect(responses.map((response) => response.statusCode)).toEqual([
      200, 200, 200,
    ]);
    expectOneCallPerEndpoint(riot);
  });

  it('remembers for a while that a Riot ID belongs to no one', async () => {
    const riot = fakeRiot();
    riot.getAccountByRiotId.mockResolvedValue(null);
    const app = createApp(riot);

    for (let lookup = 1; lookup <= 2; lookup++) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(404);
    }
    expect(riot.getAccountByRiotId).toHaveBeenCalledTimes(1);
  });

  it('does not keep a failure: the next lookup asks Riot again', async () => {
    const riot = fakeRiot();
    riot.getAccountByRiotId.mockRejectedValueOnce(
      new RiotApiError('timeout', 'Riot did not answer'),
    );
    const app = createApp(riot);

    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(504);
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    expect(riot.getAccountByRiotId).toHaveBeenCalledTimes(2);
  });
});
