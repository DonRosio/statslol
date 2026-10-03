import { inspect } from 'node:util';

import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createRiotClient } from './client.ts';
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

const client = createRiotClient({ apiKey: API_KEY, timeoutMs: 100 });

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
      riotAnswers(respond);
      // inspect() shows everything: message, stack, properties and cause.
      expect(inspect(await lookUpError(), { depth: 5 })).not.toContain(API_KEY);
    }
  });
});
