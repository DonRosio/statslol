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

const SYNC = '/api/v1/players/euw/Hide%20on%20bush/KR1/champions/sync';
const CHAMPIONS = '/api/v1/players/euw/Hide%20on%20bush/KR1/champions';

function setUp() {
  const store = new MemoryMatchStore();
  const riot = {
    getAccountByRiotId: vi.fn<RiotClient['getAccountByRiotId']>(() =>
      Promise.resolve(ACCOUNT),
    ),
    getMatchIdsByPuuid: vi.fn<RiotClient['getMatchIdsByPuuid']>(() =>
      Promise.resolve(['EUW1_2', 'EUW1_1']),
    ),
    getMatch: vi.fn<RiotClient['getMatch']>((_platform, id) =>
      Promise.resolve(fakeMatch(id)),
    ),
  };
  const app = buildApp(TEST_CONFIG, {
    riot: riot as unknown as RiotClient,
    cacheStore: new MemoryStore(),
    matchStore: store,
  });
  onTestFinished(() => app.close());
  return { riot, app };
}

describe('the loading of a season', () => {
  it('starts with POST, shows its progress with GET, and fills the statistics', async () => {
    const { app } = setUp();

    const started = await app.inject({
      method: 'POST',
      url: `${SYNC}?season=2026`,
    });
    expect(started.statusCode).toBe(200);
    expect(['queued', 'running', 'done']).toContain(
      started.json<{ state: string }>().state,
    );

    await vi.waitFor(async () => {
      const status = await app.inject({
        method: 'GET',
        url: `${SYNC}?season=2026`,
      });
      expect(status.json()).toEqual({
        state: 'done',
        done: 2,
        total: 2,
        failed: 0,
      });
    });
    const stats = await app.inject({
      method: 'GET',
      url: `${CHAMPIONS}?season=2026`,
    });
    expect(
      stats.json<{ records: { games: number }[] }>().records[0]?.games,
    ).toBe(2);
  });

  it('is idle before it starts', async () => {
    const { app } = setUp();

    const response = await app.inject({ method: 'GET', url: SYNC });

    expect(response.json()).toEqual({
      state: 'idle',
      done: 0,
      total: 0,
      failed: 0,
    });
  });

  it('answers 404 for an unknown player, and starts nothing', async () => {
    const { riot, app } = setUp();
    riot.getAccountByRiotId.mockResolvedValue(null);

    const response = await app.inject({ method: 'POST', url: SYNC });

    expect(response.statusCode).toBe(404);
    expect(riot.getMatchIdsByPuuid).not.toHaveBeenCalled();
  });

  it('answers 400 for an unknown season', async () => {
    const { riot, app } = setUp();

    const response = await app.inject({
      method: 'POST',
      url: `${SYNC}?season=2019-1`,
    });

    expect(response.statusCode).toBe(400);
    expect(riot.getAccountByRiotId).not.toHaveBeenCalled();
  });

  it('cannot be started from another website', async () => {
    const { riot, app } = setUp();

    const response = await app.inject({
      method: 'POST',
      url: SYNC,
      headers: { 'sec-fetch-site': 'cross-site' },
    });

    expect(response.statusCode).toBe(403);
    expect(riot.getAccountByRiotId).not.toHaveBeenCalled();
  });
});
