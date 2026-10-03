import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { createClient } from '@redis/client';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { Secret } from '../secret.ts';
import { fakeLogger } from '../test-logger.ts';
import { createRedisStore, type RedisConnection } from './redis-store.ts';

/** The Redis server of compose.yaml. */
function redisConnection(): RedisConnection {
  const password = process.env.REDIS_PASSWORD;
  if (password === undefined || password === '') {
    throw new Error('REDIS_PASSWORD must be set (in .env, see .env.example)');
  }
  return { host: 'localhost', port: 6379, password: new Secret(password) };
}

/** A store and what it logs. It is closed at the end of the test. */
function createStore(connection: RedisConnection) {
  const log = fakeLogger();
  const store = createRedisStore(connection, log);
  onTestFinished(() => store.close());
  return { store, log };
}

/** A key that no other test or run uses. */
function newKey() {
  return `test:${randomUUID()}`;
}

describe('Redis store', () => {
  it('keeps a value for the time asked', async () => {
    const connection = redisConnection();
    const { store, log } = createStore(connection);
    await vi.waitFor(() => {
      expect(log.info).toHaveBeenCalledWith('Redis connected: cache enabled');
    });
    const key = newKey();

    await store.set(key, '{"level":30}', 60);

    expect(await store.get(key)).toBe('{"level":30}');
    // Checked with a separate client: Redis deletes the key once its TTL is over.
    const redis = await createClient({
      password: connection.password.reveal(),
    }).connect();
    onTestFinished(() => redis.close());
    expect(await redis.ttl(key)).toBeGreaterThan(55);
    await redis.del(key);
  });

  it('deletes keys', async () => {
    const { store, log } = createStore(redisConnection());
    await vi.waitFor(() => {
      expect(log.info).toHaveBeenCalledWith('Redis connected: cache enabled');
    });
    const keys = [newKey(), newKey()];
    for (const key of keys) await store.set(key, 'value', 60);

    await store.delete(keys);

    for (const key of keys) expect(await store.get(key)).toBeNull();
  });

  it('stores a key only if it is absent, else tells how long the existing one lives', async () => {
    const { store, log } = createStore(redisConnection());
    await vi.waitFor(() => {
      expect(log.info).toHaveBeenCalledWith('Redis connected: cache enabled');
    });
    const key = newKey();
    onTestFinished(() => store.delete([key]));

    expect(await store.setIfAbsent(key, 60)).toBe(0);
    const secondsLeft = await store.setIfAbsent(key, 60);

    expect(secondsLeft).toBeGreaterThan(55);
    expect(secondsLeft).toBeLessThanOrEqual(60);
  });

  it('finds nothing under a key it does not have', async () => {
    const { store, log } = createStore(redisConnection());
    await vi.waitFor(() => {
      expect(log.info).toHaveBeenCalledWith('Redis connected: cache enabled');
    });

    expect(await store.get(newKey())).toBeNull();
  });

  it('finds nothing and keeps nothing while Redis is unreachable, and logs it once', async () => {
    // Nothing listens on port 1.
    const { store, log } = createStore({ ...redisConnection(), port: 1 });

    expect(await store.get(newKey())).toBeNull();
    await store.set(newKey(), 'value', 60);
    // The client keeps trying to connect in the background.
    await sleep(500);

    expect(log.warn.mock.calls).toMatchObject([
      [
        { err: { code: 'ECONNREFUSED' } },
        'Redis unavailable: no cache until it is back',
      ],
    ]);
  });

  it('logs why Redis refuses the connection, once', async () => {
    const { store, log } = createStore({
      ...redisConnection(),
      password: new Secret('wrong password'),
    });

    expect(await store.get(newKey())).toBeNull();
    await sleep(500);

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0]?.[0]).toMatchObject({
      err: { message: expect.stringContaining('WRONGPASS') as unknown },
    });
  });
});
