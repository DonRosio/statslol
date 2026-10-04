import type { Platform, RiotClient, RiotMatch } from '@statslol/riot-client';

import type { MatchStore } from '../db/matches.ts';
import { createSingleFlight } from '../single-flight.ts';

export interface MatchLoader {
  /**
   * The matches with these IDs, in the same order: read from the database, or else fetched
   * from Riot (and stored). A match Riot does not have (any more) is null.
   */
  getMany(
    platform: Platform,
    ids: readonly string[],
  ): Promise<(RiotMatch | null)[]>;
}

/**
 * Gives finished matches. A match never changes: each is fetched from Riot once, then read
 * from the database. Friends who played together look at the same matches, and the page of
 * a history and the details of a match ask for the same ones: each is fetched only once,
 * even when several requests need it at the same time.
 */
export function createMatchLoader({
  riot,
  store,
  keyGeneration,
}: {
  readonly riot: Pick<RiotClient, 'getMatch'>;
  readonly store: MatchStore;
  readonly keyGeneration: number;
}): MatchLoader {
  const singleFlight = createSingleFlight();

  function fetchMatch(
    platform: Platform,
    id: string,
  ): Promise<RiotMatch | null> {
    return singleFlight.run(id, async () => {
      const match = await riot.getMatch(platform, id);
      if (match !== null) await store.save(match, keyGeneration);
      return match;
    });
  }

  return {
    async getMany(platform, ids) {
      const stored = await store.findMany(ids, keyGeneration);
      // The missing matches are fetched at the same time: the Riot client spaces the calls
      // out to respect the rate limits.
      return Promise.all(
        ids.map((id) => {
          const match = stored.get(id);
          return match === undefined
            ? fetchMatch(platform, id)
            : Promise.resolve(match);
        }),
      );
    },
  };
}
