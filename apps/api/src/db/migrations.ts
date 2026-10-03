import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

import { clientConfig, type DatabaseConnection } from './connection.ts';

/** The migrations written by `pnpm db:generate` (see drizzle.config.ts). */
export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../drizzle', import.meta.url),
);

// Where Drizzle records the migrations a database has already run (its default location).
const JOURNAL_TABLE = 'drizzle.__drizzle_migrations';

/**
 * Applies the migrations that the database has not run yet, in a single transaction: if one
 * fails, none is applied. Returns how many were applied (0 if it was up to date).
 */
export async function applyMigrations(
  connection: DatabaseConnection,
): Promise<number> {
  const client = new Client(clientConfig(connection));
  await client.connect();
  try {
    const before = await countAppliedMigrations(client);
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER });
    return (await countAppliedMigrations(client)) - before;
  } finally {
    await client.end();
  }
}

async function countAppliedMigrations(client: Client): Promise<number> {
  // to_regclass gives null when the table does not exist: the database was never migrated.
  const journal = await client.query<{ exists: boolean }>(
    `SELECT to_regclass('${JOURNAL_TABLE}') IS NOT NULL AS exists`,
  );
  if (journal.rows[0]?.exists !== true) return 0;

  const { rows } = await client.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM ${JOURNAL_TABLE}`,
  );
  return rows[0]?.count ?? 0;
}
