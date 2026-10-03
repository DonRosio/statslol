import type { ClientConfig } from 'pg';

import type { Secret } from '../secret.ts';

/** Where the PostgreSQL database is, and which role connects to it. */
export interface DatabaseConnection {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: Secret;
}

/** Options of a pg client. The only place where the database password is revealed. */
export function clientConfig(connection: DatabaseConnection): ClientConfig {
  return {
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password.reveal(),
    // Fails instead of waiting indefinitely when the database cannot be reached.
    connectionTimeoutMillis: 5000,
  };
}
