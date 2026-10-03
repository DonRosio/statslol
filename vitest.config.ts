import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // One Vitest project per workspace package, so each can have its own settings
    // (e.g. a browser-like environment for the web app).
    projects: ['apps/*', 'packages/*'],
  },
});
