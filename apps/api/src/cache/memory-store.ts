import type { CacheStore } from './cache.ts';

/** Cache store in memory, for the tests: it records the TTLs, but never expires a value. */
export class MemoryStore implements CacheStore {
  readonly entries = new Map<string, { value: string; ttlSeconds: number }>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.entries.get(key)?.value ?? null);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, ttlSeconds });
    return Promise.resolve();
  }
}
