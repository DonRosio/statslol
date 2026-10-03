import { describe, expect, it } from 'vitest';

import { ApiError } from './api/client.ts';
import { shouldRetry } from './query-client.ts';

describe('shouldRetry', () => {
  it.each([400, 404, 429])('never retries a %i', (status) => {
    expect(shouldRetry(0, new ApiError(status))).toBe(false);
  });

  it.each([
    ['a server error', new ApiError(502)],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('retries %s once', (_case, error) => {
    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(false);
  });
});
