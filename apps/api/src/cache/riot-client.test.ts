import type {
  RiotAccount,
  RiotClient,
  RiotLeagueEntry,
  RiotSummoner,
} from '@statslol/riot-client';
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

function setUp() {
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
  };
  const store = new MemoryStore();
  const cached = cachedRiotClient(riot, createCache(store, fakeLogger()));
  return { riot, store, cached };
}

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

    expect(store.entries.get('riot:account:hide on bush#kr1')?.ttlSeconds).toBe(
      6 * 3600,
    );
    expect(store.entries.get('riot:account:nobody#euw')?.ttlSeconds).toBe(300);
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
    expect(store.entries.get(`riot:summoner:euw1:${PUUID}`)?.ttlSeconds).toBe(
      300,
    );
    expect(store.entries.get(`riot:league:kr:${PUUID}`)?.ttlSeconds).toBe(300);
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
});
