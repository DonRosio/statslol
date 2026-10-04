import { regionSchema, type Region } from '@statslol/shared';

const STORAGE_KEY = 'statslol.lastRegion';

/** The region of the last search, or undefined if there was none (or the browser forgot it). */
export function loadLastRegion(): Region | undefined {
  try {
    const stored = regionSchema.safeParse(localStorage.getItem(STORAGE_KEY));
    return stored.success ? stored.data : undefined;
  } catch {
    // Storage can be blocked (private window, site data refused): nothing to remember with.
    return undefined;
  }
}

/** Remembers the region of a search, to select it the next time. */
export function saveLastRegion(region: Region): void {
  try {
    localStorage.setItem(STORAGE_KEY, region);
  } catch {
    // Same as above: the search works, it is just not remembered.
  }
}
