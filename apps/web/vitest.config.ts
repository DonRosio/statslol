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
    },
  }),
);
