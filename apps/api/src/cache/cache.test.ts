import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { fakeLogger } from '../test-logger.ts';
import { createCache, type CachePolicy, type CacheStore } from './cache.ts';
import { MemoryStore } from './memory-store.ts';

interface Player {
  level: number;
}

// "Nothing found" (null) is kept for less time than a value.
const policy: CachePolicy<Player | null> = {
  name: 'player',
  schema: z.object({ level: z.number() }).nullable(),
  ttlSeconds: (player) => (player === null ? 10 : 60),
};

function setUp(store: CacheStore = new MemoryStore()) {
  const log = fakeLogger();
  return { log, cache: createCache(store, log) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('getOrLoad', () => {
  it('loads a missing value and stores it with its TTL, then answers from the store', async () => {
    const store = new MemoryStore();
    const { cache } = setUp(store);
    const load = vi.fn(() => Promise.resolve({ level: 30 }));

    expect(await cache.getOrLoad('player:1', policy, load)).toEqual({
      level: 30,
    });
    expect(await cache.getOrLoad('player:1', policy, load)).toEqual({
      level: 30,
    });

    expect(load).toHaveBeenCalledTimes(1);
    expect(store.entries.get('player:1')).toMatchObject({
      value: '{"level":30}',
      ttlSeconds: 60,
    });
  });

  it('also keeps "nothing found", for the time its policy gives', async () => {
    const store = new MemoryStore();
    const { cache } = setUp(store);
    const load = vi.fn(() => Promise.resolve(null));

    expect(await cache.getOrLoad('player:1', policy, load)).toBeNull();
    expect(await cache.getOrLoad('player:1', policy, load)).toBeNull();

    expect(load).toHaveBeenCalledTimes(1);
    expect(store.entries.get('player:1')).toMatchObject({
      value: 'null',
      ttlSeconds: 10,
    });
  });

  it('makes simultaneous calls for the same key share one load (single-flight)', async () => {
    const { cache } = setUp();
    const { promise, resolve } = Promise.withResolvers<Player>();
    const load = vi.fn(() => promise);

    const calls = [1, 2, 3].map(() =>
      cache.getOrLoad('player:1', policy, load),
    );
    resolve({ level: 30 });

    expect(await Promise.all(calls)).toEqual([
      { level: 30 },
      { level: 30 },
      { level: 30 },
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads different keys separately', async () => {
    const { cache } = setUp();
    const load = vi.fn(() => Promise.resolve({ level: 30 }));

    await Promise.all([
      cache.getOrLoad('player:1', policy, load),
      cache.getOrLoad('player:2', policy, load),
    ]);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('gives a failed load to every waiting call, keeps nothing, and loads again next time', async () => {
    const store = new MemoryStore();
    const { cache } = setUp(store);
    const load = vi
      .fn<() => Promise<Player>>()
      .mockRejectedValueOnce(new Error('Riot is unavailable'))
      .mockResolvedValueOnce({ level: 30 });

    const first = cache.getOrLoad('player:1', policy, load);
    const second = cache.getOrLoad('player:1', policy, load);
    await expect(first).rejects.toThrow('Riot is unavailable');
    await expect(second).rejects.toThrow('Riot is unavailable');
    expect(store.entries.size).toBe(0);

    expect(await cache.getOrLoad('player:1', policy, load)).toEqual({
      level: 30,
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['in another format', '{"level":"thirty"}'],
    ['that is not JSON', '{"level":'],
  ])(
    'loads again a stored value %s, and replaces it',
    async (_case, stored) => {
      const store = new MemoryStore();
      await store.set('player:1', stored, 60);
      const { cache, log } = setUp(store);

      expect(
        await cache.getOrLoad('player:1', policy, () =>
          Promise.resolve({ level: 30 }),
        ),
      ).toEqual({ level: 30 });

      expect(store.entries.get('player:1')?.value).toBe('{"level":30}');
      expect(log.warn.mock.calls).toMatchObject([
        [
          { cache: 'player' },
          'Unexpected value in the cache: loading it again',
        ],
      ]);
    },
  );

  it('answers with the loaded value when the store fails, and logs it', async () => {
    const failing: CacheStore = {
      get: () => Promise.reject(new Error('Redis exploded')),
      set: () => Promise.reject(new Error('Redis exploded')),
      delete: () => Promise.reject(new Error('Redis exploded')),
      setIfAbsent: () => Promise.reject(new Error('Redis exploded')),
    };
    const { cache, log } = setUp(failing);

    expect(
      await cache.getOrLoad('player:1', policy, () =>
        Promise.resolve({ level: 30 }),
      ),
    ).toEqual({ level: 30 });

    expect(log.warn.mock.calls).toMatchObject([
      [{ cache: 'player' }, 'Cache read failed'],
      [{ cache: 'player' }, 'Cache write failed'],
    ]);
  });

  it('waits at most 200 ms for a store that does not answer', async () => {
    vi.useFakeTimers();
    const silent: CacheStore = {
      get: () => new Promise(() => undefined),
      set: () => new Promise(() => undefined),
      delete: () => new Promise(() => undefined),
      setIfAbsent: () => new Promise(() => undefined),
    };
    const { cache } = setUp(silent);
    let player: Player | null | undefined;

    void cache
      .getOrLoad('player:1', policy, () => Promise.resolve({ level: 30 }))
      .then((value) => (player = value));
    await vi.advanceTimersByTimeAsync(199);
    expect(player).toBeUndefined();
    // 200 ms for the read, then 200 ms for the write.
    await vi.advanceTimersByTimeAsync(201);

    expect(player).toEqual({ level: 30 });
  });
});
