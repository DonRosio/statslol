import { z } from 'zod';

import { RiotApiError } from './errors.ts';
import { parseRetryAfterSeconds, RateLimiter } from './rate-limiter.ts';

// Account data is global: the americas, asia and europe clusters all answer for any
// player, and Riot recommends the closest one. Our server is in Europe.
const ACCOUNT_ROUTE = 'europe';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_QUEUE_WAIT_MS = 3000;

/** Riot's platforms: one per League of Legends server, each with its own API host. */
export const PLATFORMS = [
  'br1',
  'eun1',
  'euw1',
  'jp1',
  'kr',
  'la1',
  'la2',
  'me1',
  'na1',
  'oc1',
  'ru',
  'sg2',
  'tr1',
  'tw2',
  'vn2',
] as const;

export type Platform = (typeof PLATFORMS)[number];

// Riot's answers are validated like any external input. PUUIDs end up in the URLs of
// later calls: only the URL-safe characters they are made of are accepted.
const puuidSchema = z.string().regex(/^[\w-]+$/);

const accountSchema = z.object({
  puuid: puuidSchema,
  gameName: z.string(),
  tagLine: z.string(),
});

const summonerSchema = z.object({
  puuid: puuidSchema,
  profileIconId: z.number().int().nonnegative(),
  summonerLevel: z.number().int().nonnegative(),
});

// Riot's vocabulary is kept as is: tier "GOLD", rank "II" (the division), queueType
// "RANKED_SOLO_5x5"... New queues appear from time to time (e.g. RANKED_PREMADE_5x5 in
// 2026), so these stay plain strings: callers pick the values they know.
const leagueEntrySchema = z.object({
  queueType: z.string(),
  tier: z.string(),
  rank: z.string(),
  leaguePoints: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
});

/** A Riot account: its permanent identifier (PUUID) and its current Riot ID. */
export type RiotAccount = Readonly<z.output<typeof accountSchema>>;

/** A player's League of Legends profile on one platform. */
export type RiotSummoner = Readonly<z.output<typeof summonerSchema>>;

/** A player's rank in one ranked queue. */
export type RiotLeagueEntry = Readonly<z.output<typeof leagueEntrySchema>>;

export interface RiotClientOptions {
  readonly apiKey: string;
  /** How long to wait for Riot's answer before giving up. Defaults to 5 seconds. */
  readonly timeoutMs?: number;
  /**
   * Longest wait for a free slot under Riot's rate limits, after which a call fails as
   * "rate-limited". Defaults to 3 seconds: someone is waiting for the page.
   */
  readonly maxQueueWaitMs?: number;
}

/** A call to Riot: where it goes, and which endpoint it is (for the method limits). */
interface RiotRequest {
  /** Routing value, which is also the start of the host name: "europe", "euw1"... */
  readonly route: string;
  /** Riot's name for the endpoint, e.g. "summoner-v4.getByPUUID". */
  readonly method: string;
  readonly path: string;
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

  /**
   * Gets the League of Legends profile of a player on one platform. Returns null if the
   * player has never played League of Legends there (e.g. a VALORANT-only account).
   */
  getSummonerByPuuid(
    platform: Platform,
    puuid: string,
  ): Promise<RiotSummoner | null>;

  /** Gets the ranks of a player on one platform: an empty list if unranked. */
  getLeagueEntriesByPuuid(
    platform: Platform,
    puuid: string,
  ): Promise<RiotLeagueEntry[]>;
}

export function createRiotClient({
  apiKey,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxQueueWaitMs = DEFAULT_MAX_QUEUE_WAIT_MS,
}: RiotClientOptions): RiotClient {
  // The key stays in this function's scope: it is not a property of the returned object,
  // so logging or serializing the client cannot reveal it.
  const limiter = new RateLimiter({ maxWaitMs: maxQueueWaitMs });

  /** Sends a GET request to Riot. Returns null when Riot answers 404 (nothing found). */
  async function get<T>(
    { route, method, path }: RiotRequest,
    schema: z.ZodType<T>,
  ): Promise<T | null> {
    // Waits for a free slot under Riot's rate limits (or fails at once if it is too far).
    await limiter.acquire(route, method);
    try {
      const response = await fetch(
        `https://${route}.api.riotgames.com${path}`,
        {
          headers: { 'X-Riot-Token': apiKey },
          // One deadline for the whole exchange, including reading the body.
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      // Every answer, errors included, tells the current limits and counts.
      limiter.update(route, method, response);
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
      const request = {
        route: ACCOUNT_ROUTE,
        method: 'account-v1.getByRiotId',
        path: `/riot/account/v1/accounts/by-riot-id/${pathSegment(gameName)}/${pathSegment(tagLine)}`,
      };
      return await get(request, accountSchema);
    },

    async getSummonerByPuuid(platform, puuid) {
      const request = {
        route: checkPlatform(platform),
        method: 'summoner-v4.getByPUUID',
        path: `/lol/summoner/v4/summoners/by-puuid/${pathSegment(puuid)}`,
      };
      return await get(request, summonerSchema);
    },

    async getLeagueEntriesByPuuid(platform, puuid) {
      const request = {
        route: checkPlatform(platform),
        method: 'league-v4.getLeagueEntriesByPUUID',
        path: `/lol/league/v4/entries/by-puuid/${pathSegment(puuid)}`,
      };
      return (await get(request, z.array(leagueEntrySchema))) ?? [];
    },
  };
}

/**
 * Checks a platform before it becomes a host name. The key is sent to that host: it is
 * never built from a value outside the known list, even if a caller bypasses the types
 * (e.g. with `as Platform`).
 */
function checkPlatform(platform: Platform): Platform {
  if (!PLATFORMS.includes(platform)) {
    throw new RangeError(`Unknown Riot platform: "${platform}"`);
  }
  return platform;
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
      retryAfterSeconds: parseRetryAfterSeconds(
        response.headers.get('Retry-After'),
      ),
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
