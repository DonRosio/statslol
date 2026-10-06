import type {
  RiotAccount,
  RiotClient,
  RiotLeagueEntry,
  RiotSummoner,
} from '@statslol/riot-client';
import { MATCHES_PER_PAGE } from '@statslol/shared';
import { describe, expect, it, vi } from 'vitest';

import { fakeLogger } from '../test-logger.ts';
import { createCache } from './cache.ts';
import { MemoryStore } from './memory-store.ts';
import { cachedRiotClient } from './riot-client.ts';

const PUUID = 'fake-puuid'.padEnd(78, '0');
const ACCOUNT: RiotAccount = {
  puuid: PUUID,
  gameName: 'Hide on bush',
  tagLine: 'KR1',
};
const SUMMONER: RiotSummoner = {
  puuid: PUUID,
  profileIconId: 6,
  summonerLevel: 800,
};
const SOLO: RiotLeagueEntry = {
  queueType: 'RANKED_SOLO_5x5',
  tier: 'CHALLENGER',
  rank: 'I',
  leaguePoints: 1234,
  wins: 300,
  losses: 250,
};

const MASTERY = {
  championId: 517,
  championLevel: 32,
  championPoints: 324_704,
  lastPlayTime: 1_790_878_271_000,
  championPointsSinceLastLevel: 7104,
  championPointsUntilNextLevel: 3896,
};

function setUp({ keyGeneration = 1, store = new MemoryStore() } = {}) {
  const riot = {
    getAccountByRiotId: vi.fn<RiotClient['getAccountByRiotId']>(() =>
      Promise.resolve(ACCOUNT),
    ),
    getSummonerByPuuid: vi.fn<RiotClient['getSummonerByPuuid']>(() =>
      Promise.resolve(SUMMONER),
    ),
    getLeagueEntriesByPuuid: vi.fn<RiotClient['getLeagueEntriesByPuuid']>(() =>
      Promise.resolve([SOLO]),
    ),
    getChampionMasteriesByPuuid: vi.fn<
      RiotClient['getChampionMasteriesByPuuid']
    >(() => Promise.resolve([MASTERY])),
    getMatchIdsByPuuid: vi.fn<RiotClient['getMatchIdsByPuuid']>(() =>
      Promise.resolve(['EUW1_2', 'EUW1_1']),
    ),
    getMatch: vi.fn<RiotClient['getMatch']>(() => Promise.resolve(null)),
  };
  const cached = cachedRiotClient(riot, createCache(store, fakeLogger()), {
    keyGeneration,
  });
  return { riot, store, cached };
}

const FIRST_PAGE = { start: 0, count: MATCHES_PER_PAGE };

describe('cachedRiotClient', () => {
  it('keeps an account for 6 hours, and "no such account" for 5 minutes', async () => {
    const { riot, store, cached } = setUp();
    riot.getAccountByRiotId
      .mockResolvedValueOnce(ACCOUNT)
      .mockResolvedValueOnce(null);

    await cached.getAccountByRiotId({
      gameName: 'Hide on bush',
      tagLine: 'KR1',
    });
    await cached.getAccountByRiotId({ gameName: 'Nobody', tagLine: 'EUW' });

    expect(
      store.entries.get('riot:1:account:hide on bush#kr1')?.ttlSeconds,
    ).toBe(6 * 3600);
    expect(store.entries.get('riot:1:account:nobody#euw')?.ttlSeconds).toBe(
      300,
    );
  });

  it('finds an account written with other upper and lower case ASCII letters in the cache', async () => {
    const { riot, cached } = setUp();

    for (const [gameName, tagLine] of [
      ['Hide on bush', 'KR1'],
      ['hide on bush', 'kr1'],
      ['HIDE ON BUSH', 'Kr1'],
    ] as const) {
      expect(await cached.getAccountByRiotId({ gameName, tagLine })).toEqual(
        ACCOUNT,
      );
    }

    expect(riot.getAccountByRiotId).toHaveBeenCalledTimes(1);
  });

  it('keeps names that differ by the case of other letters apart', async () => {
    const { riot, cached } = setUp();

    await cached.getAccountByRiotId({ gameName: 'Élodie', tagLine: 'EUW' });
    await cached.getAccountByRiotId({ gameName: 'élodie', tagLine: 'EUW' });

    expect(riot.getAccountByRiotId).toHaveBeenCalledTimes(2);
  });

  it('keeps the profile and the ranks for 5 minutes, separately for each platform', async () => {
    const { riot, store, cached } = setUp();

    for (const platform of ['euw1', 'euw1', 'kr'] as const) {
      await cached.getSummonerByPuuid(platform, PUUID);
      await cached.getLeagueEntriesByPuuid(platform, PUUID);
    }

    expect(riot.getSummonerByPuuid).toHaveBeenCalledTimes(2);
    expect(riot.getLeagueEntriesByPuuid).toHaveBeenCalledTimes(2);
    expect(store.entries.get(`riot:1:summoner:euw1:${PUUID}`)?.ttlSeconds).toBe(
      300,
    );
    expect(store.entries.get(`riot:1:league:kr:${PUUID}`)?.ttlSeconds).toBe(
      300,
    );
  });

  it('keeps the mastery for 10 minutes, separately for each platform', async () => {
    const { riot, store, cached } = setUp();

    for (const platform of ['euw1', 'euw1', 'kr'] as const) {
      expect(await cached.getChampionMasteriesByPuuid(platform, PUUID)).toEqual(
        [MASTERY],
      );
    }

    expect(riot.getChampionMasteriesByPuuid).toHaveBeenCalledTimes(2);
    expect(store.entries.get(`riot:1:mastery:euw1:${PUUID}`)?.ttlSeconds).toBe(
      600,
    );
  });

  it('answers what Riot answered, read back from the cache', async () => {
    const { cached } = setUp();

    for (let lookup = 1; lookup <= 2; lookup++) {
      expect(await cached.getSummonerByPuuid('euw1', PUUID)).toEqual(SUMMONER);
      expect(await cached.getLeagueEntriesByPuuid('euw1', PUUID)).toEqual([
        SOLO,
      ]);
    }
  });

  it('starts a new set of keys with each key generation', async () => {
    const store = new MemoryStore();
    const before = setUp({ keyGeneration: 1, store });
    const after = setUp({ keyGeneration: 2, store });
    const riotId = { gameName: 'Hide on bush', tagLine: 'KR1' };

    await before.cached.getAccountByRiotId(riotId);
    // The PUUID cached with the previous application is never read again.
    await after.cached.getAccountByRiotId(riotId);

    expect(after.riot.getAccountByRiotId).toHaveBeenCalledTimes(1);
    expect(store.entries.has('riot:2:account:hide on bush#kr1')).toBe(true);
  });

  it('keeps the first page of match IDs for 2 minutes, and not the next ones', async () => {
    const { riot, store, cached } = setUp();

    for (let lookup = 1; lookup <= 2; lookup++) {
      expect(
        await cached.getMatchIdsByPuuid('euw1', PUUID, FIRST_PAGE),
      ).toEqual(['EUW1_2', 'EUW1_1']);
      await cached.getMatchIdsByPuuid('euw1', PUUID, {
        start: MATCHES_PER_PAGE,
        count: MATCHES_PER_PAGE,
      });
    }

    // Once for the first page, twice for the second.
    expect(riot.getMatchIdsByPuuid).toHaveBeenCalledTimes(3);
    expect(
      store.entries.get(`riot:1:match-ids:euw1:${PUUID}`)?.ttlSeconds,
    ).toBe(120);
  });

  it('does not keep matches: they are stored in the database', async () => {
    const { riot, cached } = setUp();

    await cached.getMatch('euw1', 'EUW1_1');
    await cached.getMatch('euw1', 'EUW1_1');

    expect(riot.getMatch).toHaveBeenCalledTimes(2);
  });

  it('forgets what it knows about a player', async () => {
    const { riot, store, cached } = setUp();
    const riotId = { gameName: 'Hide on bush', tagLine: 'KR1' };
    const lookUp = async () => {
      await cached.getAccountByRiotId(riotId);
      await cached.getSummonerByPuuid('euw1', PUUID);
      await cached.getLeagueEntriesByPuuid('euw1', PUUID);
      await cached.getChampionMasteriesByPuuid('euw1', PUUID);
      await cached.getMatchIdsByPuuid('euw1', PUUID, FIRST_PAGE);
    };
    await lookUp();

    await cached.forgetPlayer({ riotId, platform: 'euw1', puuid: PUUID });

    expect(store.entries.size).toBe(0);
    await lookUp();
    for (const method of [
      riot.getAccountByRiotId,
      riot.getSummonerByPuuid,
      riot.getLeagueEntriesByPuuid,
      riot.getChampionMasteriesByPuuid,
      riot.getMatchIdsByPuuid,
    ]) {
      expect(method).toHaveBeenCalledTimes(2);
    }
  });
});
