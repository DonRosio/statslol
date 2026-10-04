import type { z } from 'zod';

/** The API answered with an error status (4xx or 5xx). */
export class ApiError extends Error {
  readonly status: number;
  /** Seconds to wait before asking again, when the API says so (429, 503); else null. */
  readonly retryAfterSeconds: number | null;

  constructor(status: number, retryAfterSeconds: number | null = null) {
    super(`The API answered with status ${String(status)}`);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * The Retry-After header in seconds. It can also be a date: our API never sends one, so a
 * date (or anything else) counts as no header.
 */
function retryAfterSeconds(response: Response): number | null {
  const value = response.headers.get('Retry-After');
  return value !== null && /^\d+$/.test(value) ? Number(value) : null;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new ApiError(response.status, retryAfterSeconds(response));
  }
  return response;
}

/**
 * Sends a GET request to the API and checks its answer against `schema`, so the rest of the
 * app only ever gets data of the expected shape (a ZodError is thrown otherwise).
 */
export async function getJson<T>(
  path: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
): Promise<T> {
  const response = await send(path, { signal });
  return schema.parse(await response.json());
}

/** Sends a POST request without a body to the API, for an action without an answer. */
export async function post(path: string): Promise<void> {
  await send(path, { method: 'POST' });
}
