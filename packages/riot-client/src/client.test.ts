import { inspect } from 'node:util';

import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { createRiotClient, type Platform, type RiotClient } from './client.ts';
import { RiotApiError } from './errors.ts';

// Valid format, but cannot be a real key (allowed in .gitleaks.toml).
const API_KEY = 'RGAPI-00000000-0000-0000-0000-000000000000';

const ACCOUNT_URL =
  'https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/:gameName/:tagLine';

// Same shape as a real answer from Riot, with fake values.
const ACCOUNT = {
  puuid: 'fake-puuid'.padEnd(78, '0'),
  gameName: 'Example Player',
  tagLine: 'EUW',
};

// MSW intercepts the requests sent by fetch: the tests never reach the real Riot API,
// and a request that no handler expects makes the test fail.
const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

// A new client for each test: its rate limiter must not carry over from one test to the next
// (e.g. a 429 stops the following calls).
function newClient() {
  return createRiotClient({ apiKey: API_KEY, timeoutMs: 100 });
}
let client: RiotClient;
beforeEach(() => {
  client = newClient();
});

function lookUp() {
  return client.getAccountByRiotId({
    gameName: 'Example Player',
    tagLine: 'EUW',
  });
}

/** Makes Riot answer every account lookup with the response built by `respond`. */
function riotAnswers(respond: () => Response) {
  server.use(http.get(ACCOUNT_URL, respond));
}

/** Looks up the account and returns the RiotApiError the lookup fails with. */
async function lookUpError(): Promise<RiotApiError> {
  try {
    await lookUp();
  } catch (error) {
    if (error instanceof RiotApiError) return error;
    throw error;
  }
  throw new Error('Expected the lookup to fail');
}

function riotStatus(status: number, message: string) {
  return { status: { message, status_code: status } };
}

describe('getAccountByRiotId', () => {
  it('returns the account (200)', async () => {
    let sentKey: string | null = null;
    server.use(
      http.get(ACCOUNT_URL, ({ request }) => {
        sentKey = request.headers.get('X-Riot-Token');
        return HttpResponse.json(ACCOUNT);
      }),
    );

    await expect(lookUp()).resolves.toEqual(ACCOUNT);
    expect(sentKey).toBe(API_KEY);
  });

  it('escapes the Riot ID, so that it cannot change the URL', async () => {
    let path: string | undefined;
    server.use(
      http.get(ACCOUNT_URL, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json(ACCOUNT);
      }),
    );

    await client.getAccountByRiotId({ gameName: 'a/b?c#d é', tagLine: 'EUW' });

    expect(path).toBe(
      '/riot/account/v1/accounts/by-riot-id/a%2Fb%3Fc%23d%20%C3%A9/EUW',
    );
  });

  // No handler is set: if a request were sent, it would fail with another error.
  it.each(['', '.', '..'])(
    'refuses %j as a URL path segment, without calling Riot',
    async (gameName) => {
      await expect(
        client.getAccountByRiotId({ gameName, tagLine: 'EUW' }),
      ).rejects.toThrow(RangeError);
    },
  );

  it('returns null when no account has this Riot ID (404)', async () => {
    riotAnswers(() =>
      HttpResponse.json(riotStatus(404, 'Data not found'), { status: 404 }),
    );

    await expect(lookUp()).resolves.toBeNull();
  });

  it('reports a rate limit, with the delay to wait (429)', async () => {
    riotAnswers(() =>
      HttpResponse.json(riotStatus(429, 'Rate limit exceeded'), {
        status: 429,
        headers: { 'Retry-After': '7' },
      }),
    );

    expect(await lookUpError()).toMatchObject({
      kind: 'rate-limited',
      status: 429,
      retryAfterSeconds: 7,
    });
  });

  it('reports a rate limit without delay when Riot gives none (429)', async () => {
    riotAnswers(() => new HttpResponse(null, { status: 429 }));

    const error = await lookUpError();
    expect(error.kind).toBe('rate-limited');
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it.each([500, 502, 503, 504])(
    'reports Riot as unavailable (%i)',
    async (status) => {
      riotAnswers(() => new HttpResponse(null, { status }));

      expect(await lookUpError()).toMatchObject({
        kind: 'unavailable',
        status,
      });
    },
  );

  it.each([401, 403])('reports a refused API key (%i)', async (status) => {
    riotAnswers(() =>
      HttpResponse.json(riotStatus(status, 'Forbidden'), { status }),
    );

    const error = await lookUpError();
    expect(error).toMatchObject({ kind: 'unauthorized', status });
    expect(error.message).toContain('expire');
  });

  it('reports any other status as unexpected (400)', async () => {
    riotAnswers(() =>
      HttpResponse.json(riotStatus(400, 'Bad request'), { status: 400 }),
    );

    expect(await lookUpError()).toMatchObject({
      kind: 'unexpected-response',
      status: 400,
    });
  });

  it('gives up when Riot does not answer in time', async () => {
    server.use(
      http.get(ACCOUNT_URL, async () => {
        await delay('infinite');
      }),
    );

    expect(await lookUpError()).toMatchObject({ kind: 'timeout' });
  });

  it('reports Riot as unavailable when it cannot be reached', async () => {
    riotAnswers(() => HttpResponse.error());

    expect(await lookUpError()).toMatchObject({
      kind: 'unavailable',
      status: undefined,
    });
  });

  it('reports an answer that is not JSON as unexpected', async () => {
    riotAnswers(() => HttpResponse.text('<html>Bad gateway</html>'));

    expect(await lookUpError()).toMatchObject({ kind: 'unexpected-response' });
  });

  it.each([
    ['without PUUID', { gameName: 'Example Player', tagLine: 'EUW' }],
    ['with a PUUID that is not URL-safe', { ...ACCOUNT, puuid: '../admin' }],
    ['with a number as game name', { ...ACCOUNT, gameName: 42 }],
  ])('reports an account %s as unexpected', async (_case, account) => {
    riotAnswers(() => HttpResponse.json(account));

    expect(await lookUpError()).toMatchObject({ kind: 'unexpected-response' });
  });

  it('never shows the API key in its errors', async () => {
    const failures = [
      () => new HttpResponse(null, { status: 403 }),
      () => new HttpResponse(null, { status: 429 }),
      () => new HttpResponse(null, { status: 500 }),
      () => HttpResponse.error(),
    ];
    for (const respond of failures) {
      client = newClient();
      riotAnswers(respond);
      // inspect() shows everything: message, stack, properties and cause.
      expect(inspect(await lookUpError(), { depth: 5 })).not.toContain(API_KEY);
    }
  });
});

describe('getSummonerByPuuid', () => {
  const SUMMONER_URL =
    'https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/:puuid';

  it('returns the profile, from the API host of the platform', async () => {
    server.use(
      http.get(SUMMONER_URL, ({ params }) =>
        HttpResponse.json({
          puuid: params.puuid,
          profileIconId: 7143,
          revisionDate: 1790973984000,
          summonerLevel: 150,
        }),
      ),
    );

    // Fields that are not used (revisionDate) are left out.
    await expect(
      client.getSummonerByPuuid('euw1', ACCOUNT.puuid),
    ).resolves.toEqual({
      puuid: ACCOUNT.puuid,
      profileIconId: 7143,
      summonerLevel: 150,
    });
  });

  it('returns null for a player who never played on this platform (404)', async () => {
    server.use(
      http.get(SUMMONER_URL, () =>
        HttpResponse.json(riotStatus(404, 'Data not found'), { status: 404 }),
      ),
    );

    await expect(
      client.getSummonerByPuuid('euw1', ACCOUNT.puuid),
    ).resolves.toBeNull();
  });

  // The API key would be sent to that host: a value outside the list must never get there.
  it.each([
    'attacker.example/',
    'euw1.attacker.example',
    'euw1@attacker.example',
  ])('refuses the platform %j, without calling Riot', async (platform) => {
    await expect(
      client.getSummonerByPuuid(platform as Platform, ACCOUNT.puuid),
    ).rejects.toThrow(RangeError);
  });
});

describe('getLeagueEntriesByPuuid', () => {
  const ENTRIES_URL =
    'https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/:puuid';

  const SOLO_ENTRY = {
    queueType: 'RANKED_SOLO_5x5',
    tier: 'CHALLENGER',
    rank: 'I',
    leaguePoints: 1234,
    wins: 300,
    losses: 250,
  };

  it('returns the entries of every queue, even the ones it does not know', async () => {
    const futureQueue = { ...SOLO_ENTRY, queueType: 'RANKED_FUTURE_QUEUE' };
    server.use(
      http.get(ENTRIES_URL, () =>
        HttpResponse.json([
          { ...SOLO_ENTRY, puuid: ACCOUNT.puuid, hotStreak: false },
          futureQueue,
        ]),
      ),
    );

    await expect(
      client.getLeagueEntriesByPuuid('kr', ACCOUNT.puuid),
    ).resolves.toEqual([SOLO_ENTRY, futureQueue]);
  });

  it('returns an empty list for an unranked player', async () => {
    server.use(http.get(ENTRIES_URL, () => HttpResponse.json([])));

    await expect(
      client.getLeagueEntriesByPuuid('kr', ACCOUNT.puuid),
    ).resolves.toEqual([]);
  });

  it('reports an entry in an unexpected format', async () => {
    server.use(
      http.get(ENTRIES_URL, () =>
        HttpResponse.json([{ ...SOLO_ENTRY, leaguePoints: '1234' }]),
      ),
    );

    await expect(
      client.getLeagueEntriesByPuuid('kr', ACCOUNT.puuid),
    ).rejects.toMatchObject({ kind: 'unexpected-response' });
  });
});

describe('rate limits', () => {
  it('follows the limits announced by Riot, and refuses a call that would wait too long', async () => {
    let calls = 0;
    server.use(
      http.get(ACCOUNT_URL, () => {
        calls++;
        return HttpResponse.json(ACCOUNT, {
          headers: { 'X-App-Rate-Limit': '1:10' },
        });
      }),
    );
    client = createRiotClient({ apiKey: API_KEY, maxQueueWaitMs: 0 });

    await expect(lookUp()).resolves.toEqual(ACCOUNT);
    // One call per 10 seconds: the next one is refused without being sent.
    expect(await lookUpError()).toMatchObject({
      kind: 'rate-limited',
      status: undefined,
      retryAfterSeconds: 11,
    });
    expect(calls).toBe(1);
  });

  it('stops calling Riot after a 429, until the delay Riot asked for is over', async () => {
    let calls = 0;
    server.use(
      http.get(ACCOUNT_URL, () => {
        calls++;
        return new HttpResponse(null, {
          status: 429,
          headers: { 'Retry-After': '30', 'X-Rate-Limit-Type': 'application' },
        });
      }),
    );

    expect(await lookUpError()).toMatchObject({ status: 429 });
    expect(await lookUpError()).toMatchObject({
      kind: 'rate-limited',
      status: undefined,
      retryAfterSeconds: 30,
    });
    expect(calls).toBe(1);
  });
});
