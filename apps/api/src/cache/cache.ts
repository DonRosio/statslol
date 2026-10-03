import type { FastifyBaseLogger } from 'fastify';
import type { z } from 'zod';

/** Where the cache keeps its values: Redis, or memory in the tests. */
export interface CacheStore {
  /** The value stored under this key, or null if there is none or the store is unavailable. */
  get(key: string): Promise<string | null>;
  /** Stores a value for ttlSeconds. Does nothing if the store is unavailable. */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** How one kind of value is cached. */
export interface CachePolicy<T> {
  /** Names the kind of value in the logs (keys are not logged: they hold player names). */
  readonly name: string;
  /** Checks a value read back from the store, which may have been written by an older version. */
  readonly schema: z.ZodType<T>;
  /** How long a value stays in the cache, in seconds. */
  readonly ttlSeconds: (value: T) => number;
}

export interface Cache {
  /**
   * Returns the value cached under `key`, or loads it with `load` and caches it. Calls for a
   * key that is being loaded wait for that load instead of starting another one
   * ("single-flight"). A key must always hold the same kind of value.
   */
  getOrLoad<T>(
    key: string,
    policy: CachePolicy<T>,
    load: () => Promise<T>,
  ): Promise<T>;
}

// Longest wait for the store, after which the value is loaded as if it were not cached:
// Redis answers in well under a millisecond, unless something is wrong with it.
const STORE_TIMEOUT_MS = 200;

/**
 * A cache in front of slow or limited sources (the Riot API). The store is only an
 * accelerator: if it fails, values are loaded from the source, and the failure is logged.
 */
export function createCache(store: CacheStore, log: FastifyBaseLogger): Cache {
  // Loads in progress, by key.
  const loading = new Map<string, Promise<unknown>>();

  async function read<T>(
    key: string,
    { name, schema }: CachePolicy<T>,
  ): Promise<{ value: T } | undefined> {
    let stored: string | null;
    try {
      stored = await withTimeout(store.get(key), STORE_TIMEOUT_MS);
    } catch (error) {
      log.warn({ err: error, cache: name }, 'Cache read failed');
      return undefined;
    }
    if (stored === null) return undefined;

    const result = schema.safeParse(parseJson(stored));
    if (!result.success) {
      log.warn(
        { cache: name },
        'Unexpected value in the cache: loading it again',
      );
      return undefined;
    }
    return { value: result.data };
  }

  async function write<T>(
    key: string,
    value: T,
    { name, ttlSeconds }: CachePolicy<T>,
  ): Promise<void> {
    try {
      await withTimeout(
        store.set(key, JSON.stringify(value), ttlSeconds(value)),
        STORE_TIMEOUT_MS,
      );
    } catch (error) {
      log.warn({ err: error, cache: name }, 'Cache write failed');
    }
  }

  async function readOrLoad<T>(
    key: string,
    policy: CachePolicy<T>,
    load: () => Promise<T>,
  ): Promise<T> {
    const cached = await read(key, policy);
    if (cached !== undefined) return cached.value;

    const value = await load();
    // Written before the load is over for the waiting callers: the next ones find it.
    await write(key, value, policy);
    return value;
  }

  return {
    getOrLoad<T>(
      key: string,
      policy: CachePolicy<T>,
      load: () => Promise<T>,
    ): Promise<T> {
      const pending = loading.get(key);
      // Same key, same kind of value: the pending load returns a T.
      if (pending !== undefined) return pending as Promise<T>;

      const promise = readOrLoad(key, policy, load).finally(() => {
        loading.delete(key);
      });
      loading.set(key, promise);
      return promise;
    },
  };
}

/** Fails if the promise takes longer than `ms`. The operation itself goes on. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`No answer within ${String(ms)} ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Parses JSON, or gives undefined (which no schema accepts) if it is not valid. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
