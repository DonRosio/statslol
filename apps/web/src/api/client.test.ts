import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { z, ZodError } from 'zod';

import { server } from '../test-server.ts';
import { ApiError, getJson, post } from './client.ts';

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

  it('gives the seconds to wait that the API sends in Retry-After', async () => {
    server.use(
      http.get(
        '/api/example',
        () =>
          new HttpResponse(null, {
            status: 503,
            headers: { 'Retry-After': '30' },
          }),
      ),
    );

    await expect(get()).rejects.toMatchObject({ retryAfterSeconds: 30 });
  });

  it.each([
    ['without Retry-After', {}],
    // Allowed by HTTP, never sent by our API.
    [
      'with a date in Retry-After',
      { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' },
    ],
  ])('gives no seconds to wait %s', async (_case, headers) => {
    server.use(
      http.get(
        '/api/example',
        () => new HttpResponse(null, { status: 503, headers }),
      ),
    );

    await expect(get()).rejects.toMatchObject({ retryAfterSeconds: null });
  });

  it('throws a ZodError when the answer has another shape', async () => {
    server.use(http.get('/api/example', () => HttpResponse.json({ name: 42 })));

    await expect(get()).rejects.toBeInstanceOf(ZodError);
  });

  it('fails when the API cannot be reached', async () => {
    server.use(http.get('/api/example', () => HttpResponse.error()));

    await expect(get()).rejects.toBeInstanceOf(TypeError);
  });
});

describe('post', () => {
  it('sends a POST request, and resolves when the API agrees', async () => {
    const methods: string[] = [];
    server.use(
      http.post('/api/action', ({ request }) => {
        methods.push(request.method);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(post('/api/action')).resolves.toBeUndefined();
    expect(methods).toEqual(['POST']);
  });

  it('throws an ApiError when the API refuses', async () => {
    server.use(
      http.post(
        '/api/action',
        () =>
          new HttpResponse(null, {
            status: 429,
            headers: { 'Retry-After': '111' },
          }),
      ),
    );

    await expect(post('/api/action')).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 111,
    });
  });
});
