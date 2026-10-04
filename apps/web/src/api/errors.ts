import { formatDuration } from '../format.ts';
import { ApiError } from './client.ts';

/** "in 45 seconds", "in 1:51" (minutes:seconds). */
function inDelay(seconds: number): string {
  return seconds < 60
    ? `in ${String(seconds)} second${seconds === 1 ? '' : 's'}`
    : `in ${formatDuration(seconds)}`;
}

/**
 * What went wrong, for a visitor: a request to the API failed with `error`. The details
 * (status, stack) only matter to developers: they are in the browser's console.
 */
export function describeError(error: Error): string {
  if (error instanceof ApiError) {
    const retry =
      error.retryAfterSeconds === null
        ? 'Try again in a moment.'
        : `Try again ${inDelay(error.retryAfterSeconds)}.`;
    if (error.status === 429) {
      return `Too many requests from your connection. ${retry}`;
    }
    // 502, 503, 504: our server cannot reach Riot, or the proxy in front of it (Vite in
    // development, Caddy in production) cannot reach our server.
    if (error.status >= 502 && error.status <= 504) {
      return `The server or Riot's servers are not answering right now. ${retry}`;
    }
    if (error.status >= 500) {
      return `Something went wrong on our side. ${retry}`;
    }
    return 'The server refused this request.';
  }
  // fetch fails with a TypeError when the request cannot be sent at all.
  if (error instanceof TypeError) {
    return 'The server cannot be reached. Check your connection, then try again.';
  }
  // A ZodError: the answer did not have the expected shape (e.g. an older version of the
  // API, during a deployment).
  return 'The server sent an unexpected answer. Try again in a moment.';
}
