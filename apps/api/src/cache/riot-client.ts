import {
  riotAccountSchema,
  riotLeagueEntrySchema,
  riotSummonerSchema,
  type RiotAccount,
  type RiotClient,
  type RiotLeagueEntry,
  type RiotSummoner,
} from '@statslol/riot-client';
import { z } from 'zod';

import type { Cache, CachePolicy } from './cache.ts';

const MINUTE = 60;
const HOUR = 60 * MINUTE;

// A Riot ID only points to another account when players rename: hours of delay are fine.
const ACCOUNT_TTL = 6 * HOUR;
// Ranks and levels change after each game.
const PROFILE_TTL = 5 * MINUTE;
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

/**
 * Wraps a Riot client so that its answers are cached: looking up the same player again
 * within a few minutes costs no call to Riot.
 */
export function cachedRiotClient(riot: RiotClient, cache: Cache): RiotClient {
  return {
    getAccountByRiotId(riotId) {
      const key = `riot:account:${foldCase(riotId.gameName)}#${foldCase(riotId.tagLine)}`;
      return cache.getOrLoad(key, accountPolicy, () =>
        riot.getAccountByRiotId(riotId),
      );
    },

    getSummonerByPuuid(platform, puuid) {
      return cache.getOrLoad(
        `riot:summoner:${platform}:${puuid}`,
        summonerPolicy,
        () => riot.getSummonerByPuuid(platform, puuid),
      );
    },

    getLeagueEntriesByPuuid(platform, puuid) {
      return cache.getOrLoad(
        `riot:league:${platform}:${puuid}`,
        leagueEntriesPolicy,
        () => riot.getLeagueEntriesByPuuid(platform, puuid),
      );
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
