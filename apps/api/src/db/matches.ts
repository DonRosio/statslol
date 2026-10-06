import {
  riotMatchSchema,
  riotParticipantSchema,
  type RiotMatch,
  type RiotParticipant,
} from '@statslol/riot-client';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from './database.ts';
import { matches } from './schema.ts';

/** A stored match from the point of view of one of its players. */
export interface PlayerGame {
  readonly queueId: number;
  readonly gameDuration: number;
  /** Missing before patch 11.20 (2021). */
  readonly gameEndTimestamp: number | undefined;
  readonly participant: RiotParticipant;
}

const playerGameRowSchema = z.object({
  queueId: z.number().int().nonnegative(),
  gameDuration: z.number().int().nonnegative(),
  gameEndTimestamp: z.number().int().nonnegative().nullable(),
  participant: riotParticipantSchema,
});

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
   * What a player did in the stored matches that started between `fromMs` (included) and
   * `toMs` (excluded), the most recent first. Only their own line of each match is read, not
   * the 10 players of a 50 KB match. Same rule as `findMany` for the key generation.
   */
  findPlayerGames(
    puuid: string,
    keyGeneration: number,
    period: { readonly fromMs: number; readonly toMs: number },
  ): Promise<PlayerGame[]>;

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

    async findPlayerGames(puuid, keyGeneration, { fromMs, toMs }) {
      // The search uses the index matches_participants_idx (the PUUIDs of the players of
      // the match), then only the line of the player is taken out of each match.
      const { rows } = await db.execute(sql`
        select
          m.data -> 'info' -> 'queueId' as "queueId",
          m.data -> 'info' -> 'gameDuration' as "gameDuration",
          m.data -> 'info' -> 'gameEndTimestamp' as "gameEndTimestamp",
          p as participant
        from ${matches} m
        cross join lateral jsonb_array_elements(m.data -> 'info' -> 'participants') as p
        where m.key_generation = ${keyGeneration}
          and m.data -> 'metadata' -> 'participants' @> ${JSON.stringify([puuid])}::jsonb
          and p ->> 'puuid' = ${puuid}
          and (m.data -> 'info' ->> 'gameStartTimestamp')::bigint >= ${String(fromMs)}::bigint
          and (m.data -> 'info' ->> 'gameStartTimestamp')::bigint < ${String(toMs)}::bigint
        order by (m.data -> 'info' ->> 'gameStartTimestamp')::bigint desc
      `);

      // A row that does not fit the schema any more is left out, as in `findMany`.
      return rows.flatMap((row) => {
        const result = playerGameRowSchema.safeParse(row);
        return result.success
          ? [
              {
                ...result.data,
                gameEndTimestamp: result.data.gameEndTimestamp ?? undefined,
              },
            ]
          : [];
      });
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
