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

// Match data is served by region, each region for several platforms. Asked the wrong
// region, Riot answers an empty list rather than an error: this table must be right
// (same as the Riven library, maintained by the author of Riot's community API schema).
const MATCH_ROUTE_BY_PLATFORM: Record<
  Platform,
  'americas' | 'asia' | 'europe' | 'sea'
> = {
  br1: 'americas',
  eun1: 'europe',
  euw1: 'europe',
  jp1: 'asia',
  kr: 'asia',
  la1: 'americas',
  la2: 'americas',
  me1: 'europe',
  na1: 'americas',
  oc1: 'sea',
  ru: 'europe',
  sg2: 'sea',
  tr1: 'europe',
  tw2: 'sea',
  vn2: 'sea',
};

// Riot's answers are validated like any external input. PUUIDs end up in the URLs of
// later calls: only the URL-safe characters they are made of are accepted. The schemas are
// exported so that an answer kept somewhere (e.g. in a cache) can be checked again.
const puuidSchema = z.string().regex(/^[\w-]+$/);

export const riotAccountSchema = z.object({
  puuid: puuidSchema,
  gameName: z.string(),
  tagLine: z.string(),
});

export const riotSummonerSchema = z.object({
  puuid: puuidSchema,
  profileIconId: z.number().int().nonnegative(),
  summonerLevel: z.number().int().nonnegative(),
});

// Riot's vocabulary is kept as is: tier "GOLD", rank "II" (the division), queueType
// "RANKED_SOLO_5x5"... New queues appear from time to time (e.g. RANKED_PREMADE_5x5 in
// 2026), so these stay plain strings: callers pick the values they know.
export const riotLeagueEntrySchema = z.object({
  queueType: z.string(),
  tier: z.string(),
  rank: z.string(),
  leaguePoints: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
});

// Match IDs end up in URLs: the platform, then a number, e.g. "EUW1_7123456789".
export const riotMatchIdSchema = z.string().regex(/^[A-Z0-9]+_\d+$/);

// What a team took on the map: how many towers, dragons... (and who was first, ignored).
const riotObjectiveSchema = z.looseObject({
  kills: z.number().int().nonnegative(),
});

// A match holds about 150 fields per player: only the ones the API uses are checked. The
// others are kept as they are (looseObject), so that a stored match keeps all of Riot's data.
const riotParticipantSchema = z.looseObject({
  // Not used in URLs: only compared with the PUUID of the player looked up.
  puuid: z.string(),
  // 1 to 10 (1 to 18 in Arena): the place of the player in the lists of the match.
  participantId: z.number().int().positive(),
  championId: z.number().int(),
  // Riot's internal name, used in Data Dragon file names (e.g. "MonkeyKing" for Wukong).
  championName: z.string(),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  totalMinionsKilled: z.number().int().nonnegative(),
  neutralMinionsKilled: z.number().int().nonnegative(),
  // TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY, or "" in modes without positions (ARAM...).
  teamPosition: z.string(),
  win: z.boolean(),
  // A "remake": the game was abandoned in its first minutes and counts for nothing.
  gameEndedInEarlySurrender: z.boolean(),
  // Place of the player's team in modes ranked by place (Arena: 1 to 6), 0 in the others.
  // Missing in matches older than Arena (2023).
  placement: z.number().int().nonnegative().optional(),
  // 100 or 200 (blue or red side). In Arena, the teams are told by `playerSubteamId`.
  teamId: z.number().int().nonnegative(),
  // Arena: the team of the player (1 to 6 in 2026), 0 or missing elsewhere.
  playerSubteamId: z.number().int().nonnegative().optional(),
  // What the details of a match show. Not read as required: a field Riot did not send
  // counts as 0, so that no match is refused for it.
  champLevel: z.number().int().nonnegative().optional(),
  totalDamageDealtToChampions: z.number().int().nonnegative().optional(),
  goldEarned: z.number().int().nonnegative().optional(),
  visionScore: z.number().int().nonnegative().optional(),
  // The player's Riot ID at the time of the match. Missing in matches before 2023, which
  // only had the summoner name.
  riotIdGameName: z.string().optional(),
  riotIdTagline: z.string().optional(),
  // The 2 summoner spells (Flash, Ignite...), by their `key` in Data Dragon. 0: none.
  summoner1Id: z.number().int().nonnegative().optional(),
  summoner2Id: z.number().int().nonnegative().optional(),
  // The 6 slots of the inventory at the end of the game, then the trinket (item6), by
  // Data Dragon's item ID. 0: empty slot.
  item0: z.number().int().nonnegative().optional(),
  item1: z.number().int().nonnegative().optional(),
  item2: z.number().int().nonnegative().optional(),
  item3: z.number().int().nonnegative().optional(),
  item4: z.number().int().nonnegative().optional(),
  item5: z.number().int().nonnegative().optional(),
  item6: z.number().int().nonnegative().optional(),
  // Runes: styles[0] is the primary tree (its first selection is the keystone), styles[1]
  // the secondary one. All 0 in modes without runes (Arena).
  perks: z
    .looseObject({
      styles: z.array(
        z.looseObject({
          style: z.number().int().nonnegative(),
          selections: z.array(
            z.looseObject({ perk: z.number().int().nonnegative() }),
          ),
        }),
      ),
    })
    .optional(),
});

export const riotMatchSchema = z.looseObject({
  metadata: z.looseObject({ matchId: riotMatchIdSchema }),
  info: z.looseObject({
    // Milliseconds since 1970.
    gameStartTimestamp: z.number().int().nonnegative(),
    // Missing before patch 11.20 (2021), when gameDuration was in milliseconds, not seconds.
    gameEndTimestamp: z.number().int().nonnegative().optional(),
    gameDuration: z.number().int().nonnegative(),
    queueId: z.number().int().nonnegative(),
    participants: z.array(riotParticipantSchema),
    // The 2 sides (100 and 200; Arena has 2 as well, whatever the teams of players), with
    // what each took on the map. Missing in some old matches.
    teams: z
      .array(
        z.looseObject({
          teamId: z.number().int().nonnegative(),
          objectives: z
            .looseObject({
              baron: riotObjectiveSchema.optional(),
              dragon: riotObjectiveSchema.optional(),
              horde: riotObjectiveSchema.optional(),
              inhibitor: riotObjectiveSchema.optional(),
              riftHerald: riotObjectiveSchema.optional(),
              tower: riotObjectiveSchema.optional(),
            })
            .optional(),
        }),
      )
      .optional(),
  }),
});

/** A Riot account: its permanent identifier (PUUID) and its current Riot ID. */
export type RiotAccount = Readonly<z.output<typeof riotAccountSchema>>;

/** A player's League of Legends profile on one platform. */
export type RiotSummoner = Readonly<z.output<typeof riotSummonerSchema>>;

/** A player's rank in one ranked queue. */
export type RiotLeagueEntry = Readonly<z.output<typeof riotLeagueEntrySchema>>;

/** A finished match (MatchDto of match-v5), with every field Riot sent. */
export type RiotMatch = z.output<typeof riotMatchSchema>;

export interface RiotClientOptions {
  readonly apiKey: string;
  /** How long to wait for Riot's answer before giving up. Defaults to 5 seconds. */
  readonly timeoutMs?: number;
  /**
   * Longest wait for a free slot under Riot's rate limits, after which a call fails as
   * "rate-limited". Defaults to 3 seconds: someone is waiting for the page.
   */
  readonly maxQueueWaitMs?: number;
  /**
   * Called after each request sent to Riot (e.g. to log or count them). Calls refused by
   * the rate limiter are not requests: they never reach Riot.
   */
  readonly onCall?: (call: RiotCall) => void;
}

/** A request sent to Riot. Its URL is left out: it contains player identifiers. */
export interface RiotCall {
  /** Riot's name for the endpoint, e.g. "summoner-v4.getByPUUID". */
  readonly method: string;
  /** Routing value: "europe", "euw1"... */
  readonly route: string;
  /** Status code of Riot's answer, undefined if none came (timeout, network failure). */
  readonly status: number | undefined;
  readonly durationMs: number;
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

  /**
   * Gets the IDs of a player's matches in the region of a platform, the most recent first:
   * `count` of them (at most 100), skipping the first `start`. An empty list past the end.
   */
  getMatchIdsByPuuid(
    platform: Platform,
    puuid: string,
    page: { readonly start: number; readonly count: number },
  ): Promise<string[]>;

  /** Gets a match, from the region of a platform. Returns null if Riot does not have it. */
  getMatch(platform: Platform, matchId: string): Promise<RiotMatch | null>;
}

export function createRiotClient({
  apiKey,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxQueueWaitMs = DEFAULT_MAX_QUEUE_WAIT_MS,
  onCall,
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
    const start = performance.now();
    let status: number | undefined;
    try {
      const response = await fetch(
        `https://${route}.api.riotgames.com${path}`,
        {
          headers: { 'X-Riot-Token': apiKey },
          // One deadline for the whole exchange, including reading the body.
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      status = response.status;
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
    } finally {
      const durationMs = Math.round(performance.now() - start);
      onCall?.({ method, route, status, durationMs });
    }
  }

  return {
    async getAccountByRiotId({ gameName, tagLine }) {
      const request = {
        route: ACCOUNT_ROUTE,
        method: 'account-v1.getByRiotId',
        path: `/riot/account/v1/accounts/by-riot-id/${pathSegment(gameName)}/${pathSegment(tagLine)}`,
      };
      return await get(request, riotAccountSchema);
    },

    async getSummonerByPuuid(platform, puuid) {
      const request = {
        route: checkPlatform(platform),
        method: 'summoner-v4.getByPUUID',
        path: `/lol/summoner/v4/summoners/by-puuid/${pathSegment(puuid)}`,
      };
      return await get(request, riotSummonerSchema);
    },

    async getLeagueEntriesByPuuid(platform, puuid) {
      const request = {
        route: checkPlatform(platform),
        method: 'league-v4.getLeagueEntriesByPUUID',
        path: `/lol/league/v4/entries/by-puuid/${pathSegment(puuid)}`,
      };
      return (await get(request, z.array(riotLeagueEntrySchema))) ?? [];
    },

    async getMatchIdsByPuuid(platform, puuid, { start, count }) {
      const query = new URLSearchParams({
        start: String(checkInteger(start, 0, Number.MAX_SAFE_INTEGER)),
        count: String(checkInteger(count, 0, 100)),
      });
      const request = {
        route: MATCH_ROUTE_BY_PLATFORM[checkPlatform(platform)],
        method: 'match-v5.getMatchIdsByPUUID',
        path: `/lol/match/v5/matches/by-puuid/${pathSegment(puuid)}/ids?${query.toString()}`,
      };
      return (await get(request, z.array(riotMatchIdSchema))) ?? [];
    },

    async getMatch(platform, matchId) {
      const request = {
        route: MATCH_ROUTE_BY_PLATFORM[checkPlatform(platform)],
        method: 'match-v5.getMatch',
        path: `/lol/match/v5/matches/${pathSegment(matchId)}`,
      };
      return await get(request, riotMatchSchema);
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

/** Checks a number sent in a URL: an integer within Riot's limits. */
function checkInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(
      `Expected an integer from ${String(min)} to ${String(max)}, got ${String(value)}`,
    );
  }
  return value;
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
