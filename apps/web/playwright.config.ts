import { defineConfig, devices } from '@playwright/test';

// Port of `vite preview` during the tests (Vite's default for preview).
const PORT = 4173;
const inCi = process.env.CI !== undefined;

/**
 * End-to-end tests: the production build of the web app (`vite build`, see the test:e2e
 * script) in a real browser. The API and Data Dragon are played by the tests
 * (e2e/fixtures.ts): no server, database or Riot key needed.
 */
export default defineConfig({
  testDir: 'e2e',
  // A test.only left in the code would silently skip every other test in CI.
  forbidOnly: inCi,
  reporter: inCi ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    // Recording of a failed test (pages, requests, console), opened with
    // `pnpm exec playwright show-trace <file>` from apps/web.
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `vite preview --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    // Always a server started for the tests: never an old build left running.
    reuseExistingServer: false,
  },
});
