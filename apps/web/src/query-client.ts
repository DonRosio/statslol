import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './api/client.ts';

/**
 * Whether a failed request to the API is worth sending again. An error status below 500
 * would come back the same (invalid input, unknown player, too many requests): only
 * network failures and server errors are retried, once.
 */
export function shouldRetry(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

/** The cache of the API's answers, shared by every component of the app. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry } },
  });
}
