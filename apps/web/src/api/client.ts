import type { z } from 'zod';

/** The API answered with an error status (4xx or 5xx). */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`The API answered with status ${String(status)}`);
    this.name = 'ApiError';
    this.status = status;
  }
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
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new ApiError(response.status);
  }
  return schema.parse(await response.json());
}
