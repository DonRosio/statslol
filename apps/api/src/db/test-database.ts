// Helpers for the tests that need the PostgreSQL server of compose.yaml (*.db.test.ts files,
// run by `pnpm test:db`).
import { randomUUID } from 'node:crypto';

import { Client, escapeIdentifier } from 'pg';

import { DATABASE_APP_ROLE, loadMigrationConfig } from '../config.ts';
import { Secret } from '../secret.ts';
import { clientConfig, type DatabaseConnection } from './connection.ts';

export interface TestDatabase {
  /** Connection as the superuser, who runs the migrations. */
  readonly owner: DatabaseConnection;
  /** Connection as the role of the API. */
  readonly app: DatabaseConnection;
  /** Deletes the database, even if connections are still open. */
  drop(): Promise<void>;
}

/**
 * Creates a new, empty database on the server of compose.yaml: each test file starts from
 * scratch and never touches the data of `pnpm dev`.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const loaded = loadMigrationConfig(process.env);
  const appPassword = process.env.POSTGRES_APP_PASSWORD;
  if (!loaded.success || appPassword === undefined || appPassword === '') {
    throw new Error(
      'POSTGRES_PASSWORD and POSTGRES_APP_PASSWORD must be set (in .env, see .env.example)',
    );
  }
  const server = loaded.config.database;
  const name = `statslol_test_${randomUUID().replaceAll('-', '')}`;
  // A name cannot be a query parameter: it is escaped instead.
  const sqlName = escapeIdentifier(name);
  await withClient(server, (client) =>
    client.query(`CREATE DATABASE ${sqlName}`),
  );

  return {
    owner: { ...server, database: name },
    app: {
      ...server,
      database: name,
      user: DATABASE_APP_ROLE,
      password: new Secret(appPassword),
    },
    async drop() {
      await withClient(server, (client) =>
        client.query(`DROP DATABASE ${sqlName} WITH (FORCE)`),
      );
    },
  };
}

/** Connects, runs `use`, then disconnects, even if `use` fails. */
export async function withClient<T>(
  connection: DatabaseConnection,
  use: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(clientConfig(connection));
  await client.connect();
  try {
    return await use(client);
  } finally {
    await client.end();
  }
}
