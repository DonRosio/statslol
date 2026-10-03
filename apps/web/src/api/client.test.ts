import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { z, ZodError } from 'zod';

import { server } from '../test-server.ts';
import { ApiError, getJson } from './client.ts';

const schema = z.object({ name: z.string() });

function get() {
  return getJson('/api/example', schema, new AbortController().signal);
}

describe('getJson', () => {
  it('returns the answer when it has the expected shape', async () => {
    server.use(
      http.get('/api/example', () => HttpResponse.json({ name: 'Faker' })),
    );

    await expect(get()).resolves.toEqual({ name: 'Faker' });
  });

  it.each([400, 404, 429, 500, 502])(
    'throws an ApiError with the status %i',
    async (status) => {
      server.use(
        http.get('/api/example', () =>
          HttpResponse.json({ message: 'error' }, { status }),
        ),
      );

      const error = await get().catch((error: unknown) => error);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toHaveProperty('status', status);
    },
  );

  it('throws a ZodError when the answer has another shape', async () => {
    server.use(http.get('/api/example', () => HttpResponse.json({ name: 42 })));

    await expect(get()).rejects.toBeInstanceOf(ZodError);
  });

  it('fails when the API cannot be reached', async () => {
    server.use(http.get('/api/example', () => HttpResponse.error()));

    await expect(get()).rejects.toBeInstanceOf(TypeError);
  });
});
