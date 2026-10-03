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

import {
  createRiotClient,
  type Platform,
  type RiotCall,
  type RiotClient,
} from './client.ts';
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

describe('onCall', () => {
  it('reports each request sent to Riot: endpoint, status and duration', async () => {
    const calls: RiotCall[] = [];
    client = createRiotClient({
      apiKey: API_KEY,
      timeoutMs: 100,
      onCall: (call) => calls.push(call),
    });
    riotAnswers(() => HttpResponse.json(ACCOUNT));
    await lookUp();
    riotAnswers(() => new HttpResponse(null, { status: 404 }));
    await lookUp();
    riotAnswers(() => HttpResponse.error());
    await lookUpError();

    expect(calls).toMatchObject([
      { method: 'account-v1.getByRiotId', route: 'europe', status: 200 },
      { method: 'account-v1.getByRiotId', route: 'europe', status: 404 },
      // No answer: Riot could not be reached.
      { method: 'account-v1.getByRiotId', route: 'europe', status: undefined },
    ]);
    for (const { durationMs } of calls) {
      expect(durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not report a call refused by the rate limiter, which never reaches Riot', async () => {
    const calls: RiotCall[] = [];
    server.use(
      http.get(ACCOUNT_URL, () =>
        HttpResponse.json(ACCOUNT, {
          headers: { 'X-App-Rate-Limit': '1:10' },
        }),
      ),
    );
    client = createRiotClient({
      apiKey: API_KEY,
      maxQueueWaitMs: 0,
      onCall: (call) => calls.push(call),
    });

    await lookUp();
    expect(await lookUpError()).toMatchObject({ kind: 'rate-limited' });

    expect(calls).toHaveLength(1);
  });
});

/** A match as Riot sends it: the fields the client checks, and a few of the others. */
function riotMatch(matchId = 'EUW1_7123456789') {
  return {
    metadata: { dataVersion: '2', matchId, participants: [ACCOUNT.puuid] },
    info: {
      gameMode: 'CLASSIC',
      gameStartTimestamp: 1_790_973_045_769,
      gameEndTimestamp: 1_790_973_980_603,
      gameDuration: 935,
      queueId: 440,
      participants: [
        {
          puuid: ACCOUNT.puuid,
          championId: 517,
          championName: 'Sylas',
          kills: 1,
          deaths: 4,
          assists: 3,
          totalMinionsKilled: 9,
          neutralMinionsKilled: 94,
          teamPosition: 'JUNGLE',
          win: false,
          gameEndedInEarlySurrender: false,
          item0: 3147,
          challenges: { kda: 1 },
        },
      ],
    },
  };
}

describe('getMatchIdsByPuuid', () => {
  it.each<[Platform, string]>([
    ['euw1', 'europe'],
    ['kr', 'asia'],
    ['na1', 'americas'],
    ['oc1', 'sea'],
  ])(
    'asks the region of the platform (%s: %s) for one page of IDs',
    async (platform, region) => {
      let url: URL | undefined;
      server.use(
        http.get(
          `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/:puuid/ids`,
          ({ request }) => {
            url = new URL(request.url);
            return HttpResponse.json(['EUW1_2', 'EUW1_1']);
          },
        ),
      );

      await expect(
        client.getMatchIdsByPuuid(platform, ACCOUNT.puuid, {
          start: 20,
          count: 10,
        }),
      ).resolves.toEqual(['EUW1_2', 'EUW1_1']);
      expect(url?.searchParams.get('start')).toBe('20');
      expect(url?.searchParams.get('count')).toBe('10');
    },
  );

  it('reports a match ID that could change a URL as unexpected', async () => {
    server.use(
      http.get(
        'https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/:puuid/ids',
        () => HttpResponse.json(['EUW1_1', '../admin']),
      ),
    );

    await expect(
      client.getMatchIdsByPuuid('euw1', ACCOUNT.puuid, { start: 0, count: 10 }),
    ).rejects.toMatchObject({ kind: 'unexpected-response' });
  });

  // No handler is set: if a request were sent, it would fail with another error.
  it.each([
    { start: -1, count: 10 },
    { start: 1.5, count: 10 },
    { start: 0, count: 101 },
  ])('refuses the page %j, without calling Riot', async (page) => {
    await expect(
      client.getMatchIdsByPuuid('euw1', ACCOUNT.puuid, page),
    ).rejects.toThrow(RangeError);
  });
});

describe('getMatch', () => {
  const MATCH_URL =
    'https://europe.api.riotgames.com/lol/match/v5/matches/:matchId';

  it('returns the match, with every field Riot sent', async () => {
    server.use(http.get(MATCH_URL, () => HttpResponse.json(riotMatch())));

    await expect(client.getMatch('euw1', 'EUW1_7123456789')).resolves.toEqual(
      riotMatch(),
    );
  });

  it('returns null for a match Riot does not have (404)', async () => {
    server.use(
      http.get(MATCH_URL, () => new HttpResponse(null, { status: 404 })),
    );

    await expect(client.getMatch('euw1', 'EUW1_1')).resolves.toBeNull();
  });

  it('reports a match without a field the API uses as unexpected', async () => {
    const match = riotMatch();
    const participant: Record<string, unknown> = {
      ...match.info.participants[0],
    };
    delete participant.win;
    server.use(
      http.get(MATCH_URL, () =>
        HttpResponse.json({
          ...match,
          info: { ...match.info, participants: [participant] },
        }),
      ),
    );

    await expect(client.getMatch('euw1', 'EUW1_1')).rejects.toMatchObject({
      kind: 'unexpected-response',
    });
  });
});
