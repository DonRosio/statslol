// The whole chain of the match history: route, cache, real Riot client (MSW answers in place
// of Riot) and PostgreSQL, as the role of the API.
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  onTestFinished,
} from 'vitest';

import { buildApp } from '../app.ts';
import { MemoryStore } from '../cache/memory-store.ts';
import { applyMigrations } from '../db/migrations.ts';
import {
  createTestDatabase,
  withClient,
  type TestDatabase,
} from '../db/test-database.ts';
import { TEST_CONFIG } from '../test-config.ts';
import { fakeMatch, PLAYER_PUUID } from '../test-matches.ts';

const MATCH_IDS = ['EUW1_3', 'EUW1_2', 'EUW1_1'];

const server = setupServer(
  http.get(
    'https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/:gameName/:tagLine',
    () =>
      HttpResponse.json({
        puuid: PLAYER_PUUID,
        gameName: 'Hide on bush',
        tagLine: 'KR1',
      }),
  ),
  http.get(
    'https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/:puuid/ids',
    () => HttpResponse.json(MATCH_IDS),
  ),
  http.get(
    'https://europe.api.riotgames.com/lol/match/v5/matches/:matchId',
    ({ params }) => HttpResponse.json(fakeMatch(String(params.matchId))),
  ),
);

let database: TestDatabase;

beforeAll(async () => {
  server.listen({ onUnhandledFrame: 'error' });
  database = await createTestDatabase();
  await applyMigrations(database.owner);
});
afterAll(async () => {
  server.close();
  await database.drop();
});

/** An app on the test database, and the number of Riot calls of each of its requests. */
function createApp() {
  const riotCalls: number[] = [];
  const app = buildApp(
    { ...TEST_CONFIG, logLevel: 'info', database: database.app },
    {
      cacheStore: new MemoryStore(),
      logStream: {
        write(line) {
          const log = JSON.parse(line) as { msg: string; riotCalls?: number };
          if (log.msg === 'request completed')
            riotCalls.push(log.riotCalls ?? 0);
        },
      },
    },
  );
  onTestFinished(() => app.close());
  return { app, riotCalls };
}

const PLAYER = '/api/v1/players/euw/Hide%20on%20bush/KR1';

describe('match history', () => {
  it('stores each match once, and refreshes a player at most every 2 minutes', async () => {
    const { app, riotCalls } = createApp();
    const history = () =>
      app.inject({ method: 'GET', url: `${PLAYER}/matches` });
    const refresh = () =>
      app.inject({ method: 'POST', url: `${PLAYER}/refresh` });

    const first = await history();
    const second = await history();
    const refreshed = await refresh();
    const tooSoon = await refresh();
    const third = await history();

    expect(first.statusCode).toBe(200);
    expect(
      first
        .json<{ matches: { id: string }[] }>()
        .matches.map((match) => match.id),
    ).toEqual(MATCH_IDS);
    expect(second.json()).toEqual(first.json());
    expect(refreshed.statusCode).toBe(204);
    expect(tooSoon.statusCode).toBe(429);
    expect(tooSoon.headers['retry-after']).toBe('120');
    expect(third.json()).toEqual(first.json());
    expect(riotCalls).toEqual([
      // Account, IDs, and the 3 matches, fetched once and stored.
      5,
      // Everything comes from the cache and the database.
      0,
      // The refresh finds the account in the cache, then forgets the player.
      0,
      // The account, forgotten, is asked again: the delay is not over.
      1,
      // The first page of IDs, forgotten too. The matches are still stored.
      1,
    ]);
    const rows = await withClient(database.owner, (client) =>
      client.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM matches',
      ),
    );
    expect(rows.rows[0]?.count).toBe(3);
  });
});
