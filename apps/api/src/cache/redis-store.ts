import { createClient } from '@redis/client';
import type { FastifyBaseLogger } from 'fastify';

import type { Secret } from '../secret.ts';
import type { CacheStore } from './cache.ts';

/** Where the Redis server is, and its password. */
export interface RedisConnection {
  readonly host: string;
  readonly port: number;
  readonly password: Secret;
}

export interface RedisStore extends CacheStore {
  /** Closes the connection (when the API stops). */
  close(): Promise<void>;
}

/**
 * Cache store in Redis. While Redis is unavailable (not started, restarting, wrong
 * password...), reads find nothing and writes are skipped: the API keeps answering, from
 * the sources. The client reconnects on its own.
 */
export function createRedisStore(
  connection: RedisConnection,
  log: FastifyBaseLogger,
): RedisStore {
  const client = createClient({
    socket: { host: connection.host, port: connection.port },
    password: connection.password.reveal(),
    // While disconnected, commands fail at once instead of waiting for the connection.
    disableOfflineQueue: true,
  });

  // The client reports every failed attempt to (re)connect: only the first one of an outage
  // is logged.
  let outageLogged = false;
  client.on('error', (error: unknown) => {
    if (outageLogged) return;
    outageLogged = true;
    log.warn({ err: error }, 'Redis unavailable: no cache until it is back');
  });
  client.on('ready', () => {
    outageLogged = false;
    log.info('Redis connected: cache enabled');
  });

  // In the background: connect() only resolves once Redis answers, and the API must start
  // without it.
  client.connect().catch(() => {
    // Already logged by the "error" listener.
  });

  return {
    async get(key) {
      if (!client.isReady) return null;
      return await client.get(key);
    },
    async set(key, value, ttlSeconds) {
      if (!client.isReady) return;
      await client.set(key, value, {
        expiration: { type: 'EX', value: ttlSeconds },
      });
    },
    async delete(keys) {
      if (!client.isReady || keys.length === 0) return;
      await client.del([...keys]);
    },
    async setIfAbsent(key, ttlSeconds) {
      if (!client.isReady) return 0;
      // NX: one atomic command, so that two simultaneous calls cannot both store the key.
      const stored = await client.set(key, '1', {
        condition: 'NX',
        expiration: { type: 'EX', value: ttlSeconds },
      });
      if (stored !== null) return 0;
      // At least 1: the key may have expired between the two commands.
      return Math.max(1, await client.ttl(key));
    },
    async close() {
      await client.close();
    },
  };
}
