import { configDefaults, defineProject } from 'vitest/config';

export default defineProject({
  test: {
    // The tests that need the database of compose.yaml form the "db" project of the root
    // vitest.config.ts: `pnpm test:db` runs them, `pnpm test` does not.
    exclude: [...configDefaults.exclude, '**/*.db.test.ts'],
  },
});
