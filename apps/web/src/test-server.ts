import { setupServer } from 'msw/node';

/**
 * Fake API for the tests: MSW intercepts the requests sent by fetch. Each test declares the
 * answers it needs with `server.use(...)`; a request that no handler expects fails the test.
 */
export const server = setupServer();
