import { setupServer } from 'msw/node';
import { onTestFinished } from 'vitest';

/**
 * Fake API for the tests: MSW intercepts the requests sent by fetch. Each test declares the
 * answers it needs with `server.use(...)`; a request that no handler expects fails the test.
 */
export const server = setupServer();

/** Paths of the requests sent from now until the end of the current test. */
export function recordRequests(): readonly string[] {
  const paths: string[] = [];
  const listener = ({ request }: { request: Request }) => {
    paths.push(new URL(request.url).pathname);
  };
  server.events.on('request:start', listener);
  onTestFinished(() => {
    server.events.removeListener('request:start', listener);
  });
  return paths;
}
