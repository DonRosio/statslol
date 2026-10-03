// Entry point of `pnpm db:migrate`: brings the database up to date with the migrations of
// drizzle/. Runs as the superuser, who owns the tables; the API connects with a role that
// can only read and write their rows.
import { loadMigrationConfig } from '../config.ts';
import { applyMigrations } from './migrations.ts';

const loaded = loadMigrationConfig(process.env);
if (!loaded.success) {
  console.error(
    `Invalid configuration, the migrations cannot run:\n${loaded.error}`,
  );
  process.exit(1);
}
const { database } = loaded.config;

try {
  const applied = await applyMigrations(database);
  console.log(
    applied === 0
      ? `Database "${database.database}" already up to date`
      : `Database "${database.database}": ${String(applied)} migration(s) applied`,
  );
} catch (error) {
  // The most common failures get a short explanation; any other is printed whole (stack
  // trace, and PostgreSQL's details for an error in a migration).
  console.error('Migrations failed:', explain(error) ?? error);
  process.exitCode = 1;
}

function explain(error: unknown): string | undefined {
  if (!(error instanceof Error) || !('code' in error)) return undefined;
  switch (error.code) {
    case 'ECONNREFUSED':
      return `${error.message}\nIs the database running? Start it with: docker compose up --detach --wait`;
    // PostgreSQL's code for a wrong password.
    case '28P01':
      return (
        `${error.message}\nPOSTGRES_PASSWORD must be the password the database was created ` +
        'with: changing it in .env does not change it in the database.'
      );
    default:
      return undefined;
  }
}
