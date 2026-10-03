import { riotMatchSchema, type RiotMatch } from '@statslol/riot-client';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from './database.ts';
import { matches } from './schema.ts';

/** Where finished matches are kept for good. */
export interface MatchStore {
  /**
   * The stored matches among `ids`, by ID. Matches fetched with another key generation are
   * left out: the PUUIDs in them are not the ones Riot gives now.
   */
  findMany(
    ids: readonly string[],
    keyGeneration: number,
  ): Promise<Map<string, RiotMatch>>;

  /**
   * Stores a match: one row per match. A match is only fetched again when its row is not
   * usable (another key generation, or data that no longer fits the schema): it replaces it.
   */
  save(match: RiotMatch, keyGeneration: number): Promise<void>;
}

export function createMatchStore(db: Database): MatchStore {
  return {
    async findMany(ids, keyGeneration) {
      if (ids.length === 0) return new Map();
      const rows = await db
        .select({ id: matches.id, data: matches.data })
        .from(matches)
        .where(
          and(
            inArray(matches.id, [...ids]),
            eq(matches.keyGeneration, keyGeneration),
          ),
        );

      const found = new Map<string, RiotMatch>();
      for (const row of rows) {
        // Checked again: the row may have been written by a version with another schema.
        // A match that does not fit any more is fetched again, and replaced.
        const result = riotMatchSchema.safeParse(row.data);
        if (result.success) found.set(row.id, result.data);
      }
      return found;
    },

    async save(match, keyGeneration) {
      await db
        .insert(matches)
        .values({ id: match.metadata.matchId, keyGeneration, data: match })
        .onConflictDoUpdate({
          target: matches.id,
          set: { keyGeneration, data: match, fetchedAt: sql`now()` },
        });
    },
  };
}
