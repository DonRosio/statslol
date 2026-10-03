import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // One Vitest project per workspace package, so each can have its own settings
    // (e.g. a browser-like environment for the web app).
    projects: [
      'apps/*',
      'packages/*',
      {
        // Tests that need the PostgreSQL server of compose.yaml: `pnpm test:db` runs them
        // (after `docker compose up`), `pnpm test` leaves them out.
        test: {
          name: 'db',
          root: 'apps/api',
          include: ['src/**/*.db.test.ts'],
          setupFiles: ['vitest.db.setup.ts'],
        },
      },
    ],
  },
});
