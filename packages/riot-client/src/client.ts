import { z } from 'zod';

import { RiotApiError } from './errors.ts';

// Account data is global: the americas, asia and europe clusters all answer for any
// player, and Riot recommends the closest one. Our server is in Europe.
const ACCOUNT_API = 'https://europe.api.riotgames.com/riot/account/v1';

const DEFAULT_TIMEOUT_MS = 5000;

// Riot's answers are validated like any external input. PUUIDs end up in the URLs of
// later calls: only the URL-safe characters they are made of are accepted.
const accountSchema = z.object({
  puuid: z.string().regex(/^[\w-]+$/),
  gameName: z.string(),
  tagLine: z.string(),
});

/** A Riot account: its permanent identifier (PUUID) and its current Riot ID. */
export type RiotAccount = Readonly<z.output<typeof accountSchema>>;

export interface RiotClientOptions {
  readonly apiKey: string;
  /** How long to wait for Riot's answer before giving up. Defaults to 5 seconds. */
  readonly timeoutMs?: number;
}

export interface RiotClient {
  /**
   * Finds the account with this Riot ID, whatever the player's region. Returns null if no
   * account has this Riot ID. Fails with a RiotApiError if Riot cannot answer.
   */
  getAccountByRiotId(riotId: {
    readonly gameName: string;
    readonly tagLine: string;
  }): Promise<RiotAccount | null>;
}

export function createRiotClient({
  apiKey,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: RiotClientOptions): RiotClient {
  // The key stays in this function's scope: it is not a property of the returned object,
  // so logging or serializing the client cannot reveal it.

  /** Sends a GET request to Riot. Returns null when Riot answers 404 (nothing found). */
  async function get<T>(url: string, schema: z.ZodType<T>): Promise<T | null> {
    try {
      const response = await fetch(url, {
        headers: { 'X-Riot-Token': apiKey },
        // One deadline for the whole exchange, including reading the body.
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        // The body of an error is not used: discard it to free the connection.
        await response.body?.cancel();
        if (response.status === 404) return null;
        throw errorForStatus(response);
      }
      return parseAnswer(schema, await response.json());
    } catch (error) {
      throw toRiotApiError(error, timeoutMs);
    }
  }

  return {
    async getAccountByRiotId({ gameName, tagLine }) {
      const path = `/accounts/by-riot-id/${pathSegment(gameName)}/${pathSegment(tagLine)}`;
      return await get(ACCOUNT_API + path, accountSchema);
    },
  };
}

/**
 * Escapes a value used as one segment of a URL path ("/", "?", "#", spaces...), so that it
 * cannot change the URL. "." and ".." cannot be escaped (URL parsers resolve them, even
 * written "%2E"): they are refused, otherwise a name like ".." would call another endpoint.
 */
function pathSegment(value: string): string {
  if (value === '' || value === '.' || value === '..') {
    throw new RangeError(`Invalid URL path segment: "${value}"`);
  }
  return encodeURIComponent(value);
}

function errorForStatus(response: Response): RiotApiError {
  const { status } = response;
  if (status === 429) {
    return new RiotApiError('rate-limited', 'Riot API rate limit exceeded', {
      status,
      retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
    });
  }
  if (status === 401 || status === 403) {
    return new RiotApiError(
      'unauthorized',
      `Riot refused the request (${String(status)}): check the API key, it may be ` +
        'invalid or expired (development keys expire every 24 hours)',
      { status },
    );
  }
  if (status >= 500) {
    return new RiotApiError(
      'unavailable',
      `Riot is unavailable (${String(status)})`,
      { status },
    );
  }
  return new RiotApiError(
    'unexpected-response',
    `Unexpected answer from Riot (${String(status)})`,
    { status },
  );
}

/** Riot gives the number of seconds to wait. */
function parseRetryAfter(value: string | null): number | undefined {
  return value !== null && /^\d+$/.test(value) ? Number(value) : undefined;
}

function parseAnswer<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new RiotApiError(
      'unexpected-response',
      `Riot answered in an unexpected format:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

/** Turns any failure of the exchange with Riot into a RiotApiError. */
function toRiotApiError(error: unknown, timeoutMs: number): RiotApiError {
  if (error instanceof RiotApiError) return error;
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new RiotApiError(
      'timeout',
      `Riot did not answer within ${String(timeoutMs)} ms`,
      { cause: error },
    );
  }
  if (error instanceof SyntaxError) {
    return new RiotApiError(
      'unexpected-response',
      'Riot answered with invalid JSON',
      { cause: error },
    );
  }
  return new RiotApiError('unavailable', 'Riot could not be reached', {
    cause: error,
  });
}
