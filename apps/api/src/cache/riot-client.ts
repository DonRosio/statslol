import {
  riotAccountSchema,
  riotLeagueEntrySchema,
  riotMatchIdSchema,
  riotSummonerSchema,
  type Platform,
  type RiotAccount,
  type RiotClient,
  type RiotLeagueEntry,
  type RiotSummoner,
} from '@statslol/riot-client';
import { MATCHES_PER_PAGE } from '@statslol/shared';
import { z } from 'zod';

import type { Cache, CachePolicy } from './cache.ts';

const MINUTE = 60;
const HOUR = 60 * MINUTE;

// A Riot ID only points to another account when players rename: hours of delay are fine.
const ACCOUNT_TTL = 6 * HOUR;
// Ranks and levels change after each game.
const PROFILE_TTL = 5 * MINUTE;
// A finished game shows up in the history within 2 minutes.
const MATCH_IDS_TTL = 2 * MINUTE;
// Long enough to absorb repeated lookups of a misspelt name, short enough for a new or
// renamed player to be found soon.
const NOT_FOUND_TTL = 5 * MINUTE;

const accountPolicy: CachePolicy<RiotAccount | null> = {
  name: 'riot account',
  schema: riotAccountSchema.nullable(),
  ttlSeconds: (account) => (account === null ? NOT_FOUND_TTL : ACCOUNT_TTL),
};

const summonerPolicy: CachePolicy<RiotSummoner | null> = {
  name: 'riot summoner',
  schema: riotSummonerSchema.nullable(),
  ttlSeconds: (summoner) => (summoner === null ? NOT_FOUND_TTL : PROFILE_TTL),
};

const leagueEntriesPolicy: CachePolicy<RiotLeagueEntry[]> = {
  name: 'riot league entries',
  schema: z.array(riotLeagueEntrySchema),
  ttlSeconds: () => PROFILE_TTL,
};

const matchIdsPolicy: CachePolicy<string[]> = {
  name: 'riot match ids',
  schema: z.array(riotMatchIdSchema),
  ttlSeconds: () => MATCH_IDS_TTL,
};

interface RiotIdInput {
  readonly gameName: string;
  readonly tagLine: string;
}

export interface CachedRiotClient extends RiotClient {
  /** Removes what the cache knows about a player: the next lookups ask Riot again. */
  forgetPlayer(player: {
    readonly riotId: RiotIdInput;
    readonly platform: Platform;
    readonly puuid: string;
  }): Promise<void>;
}

/**
 * Wraps a Riot client so that its answers are cached: looking up the same player again
 * within a few minutes costs no call to Riot. Matches are not cached here: they are stored
 * for good in PostgreSQL.
 */
export function cachedRiotClient(
  riot: RiotClient,
  cache: Cache,
  { keyGeneration }: { readonly keyGeneration: number },
): CachedRiotClient {
  // PUUIDs depend on the application of the API key: a new key generation starts a new set
  // of keys, and the PUUIDs cached for the previous one are never read again.
  const prefix = `riot:${String(keyGeneration)}`;
  const keys = {
    account: ({ gameName, tagLine }: RiotIdInput) =>
      `${prefix}:account:${foldCase(gameName)}#${foldCase(tagLine)}`,
    summoner: (platform: Platform, puuid: string) =>
      `${prefix}:summoner:${platform}:${puuid}`,
    league: (platform: Platform, puuid: string) =>
      `${prefix}:league:${platform}:${puuid}`,
    latestMatchIds: (platform: Platform, puuid: string) =>
      `${prefix}:match-ids:${platform}:${puuid}`,
  };

  return {
    getAccountByRiotId(riotId) {
      return cache.getOrLoad(keys.account(riotId), accountPolicy, () =>
        riot.getAccountByRiotId(riotId),
      );
    },

    getSummonerByPuuid(platform, puuid) {
      return cache.getOrLoad(
        keys.summoner(platform, puuid),
        summonerPolicy,
        () => riot.getSummonerByPuuid(platform, puuid),
      );
    },

    getLeagueEntriesByPuuid(platform, puuid) {
      return cache.getOrLoad(
        keys.league(platform, puuid),
        leagueEntriesPolicy,
        () => riot.getLeagueEntriesByPuuid(platform, puuid),
      );
    },

    getMatchIdsByPuuid(platform, puuid, page) {
      // Only the first page is cached: it comes with every profile. The next ones are asked
      // for rarely, and caching them would make a history refresh much more complicated.
      if (page.start !== 0 || page.count !== MATCHES_PER_PAGE) {
        return riot.getMatchIdsByPuuid(platform, puuid, page);
      }
      return cache.getOrLoad(
        keys.latestMatchIds(platform, puuid),
        matchIdsPolicy,
        () => riot.getMatchIdsByPuuid(platform, puuid, page),
      );
    },

    getMatch(platform, matchId) {
      return riot.getMatch(platform, matchId);
    },

    async forgetPlayer({ riotId, platform, puuid }) {
      await cache.forget([
        keys.account(riotId),
        keys.summoner(platform, puuid),
        keys.league(platform, puuid),
        keys.latestMatchIds(platform, puuid),
      ]);
    },
  };
}

/**
 * Riot finds a Riot ID whatever the case of its ASCII letters ("hide on bush#kr1" is
 * "Hide on bush#KR1"), so these spellings share a cache entry. Other letters keep their
 * case: how Riot compares them was not checked, and two players must never share an entry.
 */
function foldCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}
