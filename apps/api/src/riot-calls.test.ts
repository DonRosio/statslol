// The whole chain with the real Riot client: route, cache, Riot client, logs. MSW answers in
// place of Riot.
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

import { buildApp } from './app.ts';
import { MemoryStore } from './cache/memory-store.ts';
import type { Config } from './config.ts';
import { Secret } from './secret.ts';

const PUUID = 'fake-puuid'.padEnd(78, '0');

const server = setupServer(
  http.get(
    'https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/:gameName/:tagLine',
    () =>
      HttpResponse.json({
        puuid: PUUID,
        gameName: 'Hide on bush',
        tagLine: 'KR1',
      }),
  ),
  http.get(
    'https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/:puuid',
    () =>
      HttpResponse.json({ puuid: PUUID, profileIconId: 6, summonerLevel: 800 }),
  ),
  http.get(
    'https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/:puuid',
    () => HttpResponse.json([]),
  ),
);
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterAll(() => {
  server.close();
});

const config: Config = {
  host: 'localhost',
  port: 0,
  // Each call to Riot is logged at debug level.
  logLevel: 'debug',
  riotApiKey: new Secret('RGAPI-test-key'),
  redis: { host: 'localhost', port: 6379, password: new Secret('unused') },
};

interface LogLine {
  msg: string;
  reqId?: string;
  riotCalls?: number;
  method?: string;
  status?: number;
}

/** An app that uses the real Riot client, and the lines it logs. */
function createApp() {
  const lines: LogLine[] = [];
  const app = buildApp(config, {
    cacheStore: new MemoryStore(),
    logStream: { write: (line) => lines.push(JSON.parse(line) as LogLine) },
  });
  onTestFinished(() => app.close());
  return { app, lines };
}

const url = '/api/v1/players/euw/Hide%20on%20bush/KR1';

describe('Riot calls in the logs', () => {
  it('counts the calls to Riot of each request: none when the cache answers', async () => {
    const { app, lines } = createApp();

    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);

    const completed = lines.filter((line) => line.msg === 'request completed');
    expect(completed.map((line) => line.riotCalls)).toEqual([3, 0]);
  });

  it('logs each call, with the id of the request that made it', async () => {
    const { app, lines } = createApp();

    await app.inject({ method: 'GET', url });

    const calls = lines.filter((line) => line.msg === 'Riot API call');
    expect(calls.map((call) => call.method).sort()).toEqual([
      'account-v1.getByRiotId',
      'league-v4.getLeagueEntriesByPUUID',
      'summoner-v4.getByPUUID',
    ]);
    const requestId = lines.find(
      (line) => line.msg === 'incoming request',
    )?.reqId;
    expect(calls.every((call) => call.reqId === requestId)).toBe(true);
    expect(calls.every((call) => call.status === 200)).toBe(true);
  });

  it('counts a call shared by simultaneous requests only once', async () => {
    const { app, lines } = createApp();

    await Promise.all([1, 2, 3].map(() => app.inject({ method: 'GET', url })));

    const riotCalls = lines
      .filter((line) => line.msg === 'request completed')
      .map((line) => line.riotCalls ?? 0);
    expect(riotCalls).toHaveLength(3);
    expect(riotCalls.reduce((total, calls) => total + calls)).toBe(3);
  });
});
