import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './test-server.ts';

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  // Removes what the test rendered, so the next test starts from an empty page.
  cleanup();
});
afterAll(() => {
  server.close();
});
