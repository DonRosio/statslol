import { defineProject, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.ts';

// Same transforms as the app itself (JSX...), plus the test settings.
export default mergeConfig(
  viteConfig,
  defineProject({
    test: {
      // Components are rendered in jsdom, a browser simulated in Node.js.
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      // Not e2e/: those tests run in a real browser, with Playwright (pnpm test:e2e).
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    },
  }),
);
