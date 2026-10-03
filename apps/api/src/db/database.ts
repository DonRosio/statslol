import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { FastifyBaseLogger } from 'fastify';
import { Pool } from 'pg';

import { clientConfig, type DatabaseConnection } from './connection.ts';

export type Database = NodePgDatabase;

/**
 * Connections to PostgreSQL, opened when a query needs one (the API starts even if the
 * database is not ready yet) and reused between queries.
 */
export function createDatabase(
  connection: DatabaseConnection,
  log: FastifyBaseLogger,
): { readonly db: Database; readonly close: () => Promise<void> } {
  const pool = new Pool({ ...clientConfig(connection), max: 10 });
  // An idle connection can fail (e.g. PostgreSQL restarts): without a listener, its error
  // would stop the API. The pool replaces the connection when a query needs one.
  pool.on('error', (error) => {
    log.error({ err: error }, 'PostgreSQL connection failed');
  });
  return {
    db: drizzle({ client: pool }),
    close: () => pool.end(),
  };
}
