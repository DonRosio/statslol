import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ApiError } from './client.ts';
import { describeError } from './errors.ts';

describe('describeError', () => {
  it.each([
    [
      new ApiError(502),
      "The server or Riot's servers are not answering right now. Try again in a moment.",
    ],
    [
      new ApiError(503, 1),
      "The server or Riot's servers are not answering right now. Try again in 1 second.",
    ],
    [
      new ApiError(504, 45),
      "The server or Riot's servers are not answering right now. Try again in 45 seconds.",
    ],
    [
      new ApiError(429, 111),
      'Too many requests from your connection. Try again in 1:51.',
    ],
    [
      new ApiError(500),
      'Something went wrong on our side. Try again in a moment.',
    ],
    [new ApiError(400), 'The server refused this request.'],
    [
      new TypeError('fetch failed'),
      'The server cannot be reached. Check your connection, then try again.',
    ],
    [
      z.string().safeParse(42).error ?? new Error(),
      'The server sent an unexpected answer. Try again in a moment.',
    ],
  ])('explains %s', (error, explanation) => {
    expect(describeError(error)).toBe(explanation);
  });
});
