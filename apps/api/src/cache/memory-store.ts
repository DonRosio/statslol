import type { CacheStore } from './cache.ts';

interface Entry {
  readonly value: string;
  readonly ttlSeconds: number;
  /** Date.now() when it expires: the tests can move the clock with fake timers. */
  readonly expiresAt: number;
}

/** Cache store in memory, for the tests. Like Redis, it forgets a value once its TTL is over. */
export class MemoryStore implements CacheStore {
  readonly #entries = new Map<string, Entry>();

  /** The entries still alive, to check what was stored. */
  get entries(): ReadonlyMap<string, Entry> {
    for (const key of this.#entries.keys()) this.#alive(key);
    return this.#entries;
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.#alive(key)?.value ?? null);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.#entries.set(key, {
      value,
      ttlSeconds,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return Promise.resolve();
  }

  delete(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.#entries.delete(key);
    return Promise.resolve();
  }

  async setIfAbsent(key: string, ttlSeconds: number): Promise<number> {
    const entry = this.#alive(key);
    if (entry !== undefined) {
      return Math.ceil((entry.expiresAt - Date.now()) / 1000);
    }
    await this.set(key, '1', ttlSeconds);
    return 0;
  }

  #alive(key: string): Entry | undefined {
    const entry = this.#entries.get(key);
    if (entry !== undefined && entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry;
  }
}
