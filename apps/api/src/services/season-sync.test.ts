import {
  RiotApiError,
  type RiotClient,
  type RiotMatch,
} from '@statslol/riot-client';
import { describe, expect, it, vi } from 'vitest';

import { MemoryMatchStore } from '../db/memory-match-store.ts';
import { fakeMatch, PLAYER_PUUID } from '../test-matches.ts';
import { fakeLogger } from '../test-logger.ts';
import { createMatchLoader } from './match-loader.ts';
import {
  createSeasonSyncService,
  type SeasonSyncRequest,
} from './season-sync.ts';

const REQUEST: SeasonSyncRequest = {
  region: 'euw',
  gameName: 'Hide on bush',
  tagLine: 'KR1',
  season: '2026',
};

/** A fake Riot that lists these match IDs for the player and has these matches. */
function setUp({
  ids = ['EUW1_3', 'EUW1_2', 'EUW1_1'],
  missing = [] as string[],
  paceMs = 0,
}: { ids?: string[]; missing?: string[]; paceMs?: number } = {}) {
  const store = new MemoryMatchStore();
  const riot = {
    getAccountByRiotId: vi.fn<RiotClient['getAccountByRiotId']>(() =>
      Promise.resolve({
        puuid: PLAYER_PUUID,
        gameName: 'Hide on bush',
        tagLine: 'KR1',
      }),
    ),
    getMatchIdsByPuuid: vi.fn<RiotClient['getMatchIdsByPuuid']>(
      (_platform, _puuid, { start, count }) =>
        Promise.resolve(ids.slice(start, start + count)),
    ),
    getMatch: vi.fn<RiotClient['getMatch']>((_platform, id) =>
      Promise.resolve(missing.includes(id) ? null : fakeMatch(id)),
    ),
  };
  const sleeps: number[] = [];
  let time = 1_000_000;
  const service = createSeasonSyncService({
    riot,
    matches: createMatchLoader({ riot, store, keyGeneration: 1 }),
    store,
    keyGeneration: 1,
    paceMs,
    log: fakeLogger(),
    now: () => time,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  });
  return {
    riot,
    store,
    service,
    sleeps,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

/** Waits until the loading ends, and gives its last status. */
async function finished(service: ReturnType<typeof setUp>['service']) {
  await vi.waitFor(async () => {
    const status = await service.status(REQUEST);
    expect(['done', 'failed']).toContain(status?.state);
  });
  return service.status(REQUEST);
}

describe('season sync', () => {
  it('fetches and stores the games of the season that are not stored yet', async () => {
    const { riot, store, service } = setUp();
    await store.save(fakeMatch('EUW1_2'), 1);

    const started = await service.start(REQUEST);

    expect(started?.state).toBe('queued');
    expect(await finished(service)).toEqual({
      state: 'done',
      done: 3,
      total: 3,
      failed: 0,
    });
    // The stored game was not fetched again.
    expect(riot.getMatch.mock.calls.map(([, id]) => id)).toEqual([
      'EUW1_3',
      'EUW1_1',
    ]);
    expect([...store.rows.keys()].sort()).toEqual([
      'EUW1_1',
      'EUW1_2',
      'EUW1_3',
    ]);
  });

  it('lists the games of the season only, 100 at a time, until a page is not full', async () => {
    const ids = Array.from(
      { length: 105 },
      (_, index) => `EUW1_${String(index + 1)}`,
    );
    const { riot, service } = setUp({ ids });

    await service.start(REQUEST);
    await finished(service);

    expect(riot.getMatchIdsByPuuid).toHaveBeenCalledTimes(2);
    expect(riot.getMatchIdsByPuuid).toHaveBeenNthCalledWith(
      1,
      'euw1',
      PLAYER_PUUID,
      {
        start: 0,
        count: 100,
        startTime: Date.parse('2026-01-08T00:00:00Z') / 1000,
        endTime: expect.any(Number) as number,
      },
    );
    expect(riot.getMatchIdsByPuuid).toHaveBeenNthCalledWith(
      2,
      'euw1',
      PLAYER_PUUID,
      expect.objectContaining({ start: 100 }),
    );
  });

  it('counts a game that Riot lists but does not have as failed, and goes on', async () => {
    const { service } = setUp({ missing: ['EUW1_2'] });

    await service.start(REQUEST);

    expect(await finished(service)).toEqual({
      state: 'done',
      done: 2,
      total: 3,
      failed: 1,
    });
  });

  it('pauses before each call to Riot', async () => {
    const { service, sleeps } = setUp({ paceMs: 2000 });

    await service.start(REQUEST);
    await finished(service);

    // 1 call for the list, 3 for the games.
    expect(sleeps).toEqual([2000, 2000, 2000, 2000]);
  });

  it('waits what Riot asks, then tries the same call again', async () => {
    const { riot, service, sleeps } = setUp({ ids: ['EUW1_1'] });
    riot.getMatch.mockRejectedValueOnce(
      new RiotApiError('rate-limited', 'slow down', { retryAfterSeconds: 7 }),
    );

    await service.start(REQUEST);

    expect(await finished(service)).toMatchObject({ state: 'done', done: 1 });
    expect(sleeps).toEqual([7000]);
    expect(riot.getMatch).toHaveBeenCalledTimes(2);
  });

  it('gives up on a game after 4 tries, and goes on with the next', async () => {
    const { riot, service } = setUp({ ids: ['EUW1_2', 'EUW1_1'] });
    riot.getMatch.mockImplementation((_platform, id) =>
      id === 'EUW1_2'
        ? Promise.reject(new RiotApiError('unavailable', 'down'))
        : Promise.resolve(fakeMatch(id)),
    );

    await service.start(REQUEST);

    expect(await finished(service)).toEqual({
      state: 'done',
      done: 1,
      total: 2,
      failed: 1,
    });
    expect(
      riot.getMatch.mock.calls.filter(([, id]) => id === 'EUW1_2'),
    ).toHaveLength(4);
  });

  it('stops when the key no longer works', async () => {
    const { riot, service } = setUp();
    riot.getMatch.mockRejectedValue(
      new RiotApiError('unauthorized', 'bad key'),
    );

    await service.start(REQUEST);

    expect((await finished(service))?.state).toBe('failed');
    expect(riot.getMatch).toHaveBeenCalledTimes(1);
  });

  it('fails when the list of the games cannot be had', async () => {
    const { riot, service } = setUp();
    riot.getMatchIdsByPuuid.mockRejectedValue(
      new RiotApiError('unexpected-response', 'odd'),
    );

    await service.start(REQUEST);

    expect(await finished(service)).toMatchObject({
      state: 'failed',
      total: 0,
    });
  });

  it('does not start again while it runs, nor right after it ended', async () => {
    const { riot, service, advance } = setUp();

    await service.start(REQUEST);
    await service.start(REQUEST);
    await finished(service);
    await service.start(REQUEST);

    expect(riot.getMatchIdsByPuuid).toHaveBeenCalledTimes(1);

    // After 2 minutes, it lists the games again (and finds nothing to fetch).
    advance(2 * 60 * 1000);
    await service.start(REQUEST);
    await vi.waitFor(() => {
      expect(riot.getMatchIdsByPuuid).toHaveBeenCalledTimes(2);
    });
    expect(riot.getMatch).toHaveBeenCalledTimes(3);
  });

  it('loads one player at a time: the next one waits its turn', async () => {
    const { riot, service } = setUp({ ids: ['EUW1_1'] });
    let release: (match: RiotMatch) => void = () => undefined;
    riot.getMatch.mockImplementationOnce(
      () =>
        new Promise<RiotMatch>((resolve) => {
          release = resolve;
        }),
    );
    // Another region: another loading (the fake account is the same).
    const other = { ...REQUEST, region: 'kr' as const };

    await service.start(REQUEST);
    await service.start(other);

    await vi.waitFor(async () => {
      expect((await service.status(REQUEST))?.state).toBe('running');
    });
    expect((await service.status(other))?.state).toBe('queued');

    release(fakeMatch('EUW1_1'));
    await vi.waitFor(async () => {
      expect((await service.status(other))?.state).toBe('done');
    });
    expect((await service.status(REQUEST))?.state).toBe('done');
  });

  it('says "idle" for a season that was never loaded, and null for an unknown player', async () => {
    const { riot, service } = setUp();

    expect(await service.status(REQUEST)).toEqual({
      state: 'idle',
      done: 0,
      total: 0,
      failed: 0,
    });

    riot.getAccountByRiotId.mockResolvedValue(null);
    expect(await service.status(REQUEST)).toBeNull();
    expect(await service.start(REQUEST)).toBeNull();
    expect(riot.getMatchIdsByPuuid).not.toHaveBeenCalled();
  });
});
