import { defineConfig } from 'drizzle-kit';

// Used by `pnpm db:generate` (drizzle-kit generate): compares src/db/schema.ts with the
// migrations already written in drizzle/, and writes the SQL of the differences as a new one.
// It needs no database. The migrations are applied by `pnpm db:migrate` (src/db/migrate.ts).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
