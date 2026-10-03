/**
 * Runs at most one load per key at a time: a call for a key that is being loaded waits for
 * that load and gets its result (or its error) instead of starting another one.
 */
export function createSingleFlight() {
  const loading = new Map<string, Promise<unknown>>();

  return {
    /** Runs `load`, unless a load of `key` is in progress. A key must always give the same type. */
    run<T>(key: string, load: () => Promise<T>): Promise<T> {
      const pending = loading.get(key);
      if (pending !== undefined) return pending as Promise<T>;

      const promise = load().finally(() => {
        loading.delete(key);
      });
      loading.set(key, promise);
      return promise;
    },
  };
}
