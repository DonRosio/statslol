// Tables of the PostgreSQL database. After a change, `pnpm db:generate` writes the migration
// that brings an existing database up to date (see drizzle.config.ts).
import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Finished matches. They never change, so they are kept forever, whole: storing Riot's full
 * answer means a new statistic never requires fetching a match again.
 */
export const matches = pgTable(
  'matches',
  {
    // Riot's match ID: the platform, then a number, e.g. "EUW1_7123456789".
    id: text('id').primaryKey(),
    // Riot encrypts PUUIDs with a key specific to each application: the PUUIDs in `data` only
    // match those obtained by the same application. The generation is incremented when we
    // change application (e.g. development key → personal key), which reveals the stale ones.
    keyGeneration: smallint('key_generation').notNull(),
    // Riot's answer (MatchDto of match-v5).
    data: jsonb('data').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // "The matches of this player": a search by PUUID in the list of the match's players
    // (metadata.participants), which the champion statistics make. Without this index,
    // PostgreSQL would read every match.
    index('matches_participants_idx').using(
      'gin',
      sql`(${table.data} -> 'metadata' -> 'participants') jsonb_path_ops`,
    ),
  ],
);
