import type { RiotAccount, RiotClient, RiotMatch } from '@statslol/riot-client';
import { MATCHES_PER_PAGE } from '@statslol/shared';
import { describe, expect, it, vi } from 'vitest';

import { MemoryMatchStore } from '../db/memory-match-store.ts';
import { fakeLogger } from '../test-logger.ts';
import { fakeMatch, PLAYER_PUUID } from '../test-matches.ts';
import { createMatchHistoryService } from './match-history.ts';

const ACCOUNT: RiotAccount = {
  puuid: PLAYER_PUUID,
  gameName: 'Hide on bush',
  tagLine: 'KR1',
};

/** Riot knows these matches of the player, the most recent first. */
function setUp(riotMatches: RiotMatch[], { keyGeneration = 1 } = {}) {
  const byId = new Map(
    riotMatches.map((match) => [match.metadata.matchId, match]),
  );
  const riot = {
    getAccountByRiotId: vi.fn<RiotClient['getAccountByRiotId']>(() =>
      Promise.resolve(ACCOUNT),
    ),
    getSummonerByPuuid: vi.fn<RiotClient['getSummonerByPuuid']>(),
    getLeagueEntriesByPuuid: vi.fn<RiotClient['getLeagueEntriesByPuuid']>(),
    getMatchIdsByPuuid: vi.fn<RiotClient['getMatchIdsByPuuid']>(
      (_platform, _puuid, { start, count }) =>
        Promise.resolve([...byId.keys()].slice(start, start + count)),
    ),
    getMatch: vi.fn<RiotClient['getMatch']>((_platform, id) =>
      Promise.resolve(byId.get(id) ?? null),
    ),
  };
  const store = new MemoryMatchStore();
  const log = fakeLogger();
  const service = createMatchHistoryService({
    riot,
    store,
    keyGeneration,
    log,
  });
  return { riot, store, log, service };
}

const PAGE = {
  region: 'kr',
  gameName: 'Hide on bush',
  tagLine: 'KR1',
} as const;

describe('getPage', () => {
  it("answers the player's matches, from their point of view", async () => {
    const { service } = setUp([fakeMatch('KR_2'), fakeMatch('KR_1')]);

    expect(await service.getPage({ ...PAGE, start: 0 })).toEqual({
      matches: [
        {
          id: 'KR_2',
          queueId: 420,
          startedAt: '2026-10-03T16:41:12.000Z',
          durationSeconds: 1834,
          result: 'win',
          championId: 517,
          championName: 'Sylas',
          kills: 7,
          deaths: 2,
          assists: 9,
          creepScore: 192,
          position: 'MIDDLE',
        },
        expect.objectContaining({ id: 'KR_1' }) as unknown,
      ],
      nextStart: null,
    });
  });

  it('asks Riot for the matches of the region of the player, one page at a time', async () => {
    const { riot, service } = setUp([]);

    await service.getPage({ ...PAGE, region: 'euw', start: 20 });

    expect(riot.getMatchIdsByPuuid).toHaveBeenCalledWith('euw1', PLAYER_PUUID, {
      start: 20,
      count: MATCHES_PER_PAGE,
    });
  });

  it('fetches each match from Riot once, then reads it from the store', async () => {
    const { riot, store, service } = setUp([
      fakeMatch('KR_2'),
      fakeMatch('KR_1'),
    ]);

    const first = await service.getPage({ ...PAGE, start: 0 });
    const second = await service.getPage({ ...PAGE, start: 0 });

    expect(second).toEqual(first);
    expect(riot.getMatch).toHaveBeenCalledTimes(2);
    expect([...store.rows.keys()]).toEqual(['KR_2', 'KR_1']);
  });

  it('fetches a match needed by simultaneous requests only once', async () => {
    const { riot, service } = setUp([fakeMatch('KR_1')]);

    await Promise.all([
      service.getPage({ ...PAGE, start: 0 }),
      service.getPage({ ...PAGE, start: 0 }),
    ]);

    expect(riot.getMatch).toHaveBeenCalledTimes(1);
  });

  it('fetches again a match stored with another key generation, and replaces it', async () => {
    const { riot, store, service } = setUp([fakeMatch('KR_1')], {
      keyGeneration: 2,
    });
    await store.save(fakeMatch('KR_1'), 1);

    await service.getPage({ ...PAGE, start: 0 });

    expect(riot.getMatch).toHaveBeenCalledTimes(1);
    expect(store.rows.get('KR_1')?.keyGeneration).toBe(2);
  });

  it('tells wins, losses and remakes apart', async () => {
    const { service } = setUp([
      fakeMatch('KR_3', { win: true }),
      fakeMatch('KR_2', { win: false }),
      // A remake: one of the teams wins it, but it counts for nothing.
      fakeMatch('KR_1', { win: true, gameEndedInEarlySurrender: true }),
    ]);

    const page = await service.getPage({ ...PAGE, start: 0 });

    expect(page?.matches.map((match) => match.result)).toEqual([
      'win',
      'loss',
      'remake',
    ]);
  });

  it('gives no position in modes without positions (ARAM, Arena...)', async () => {
    const { service } = setUp([fakeMatch('KR_1', { teamPosition: '' })]);

    const page = await service.getPage({ ...PAGE, start: 0 });

    expect(page?.matches[0]?.position).toBeNull();
  });

  it('reads the duration of a match from before patch 11.20 in milliseconds', async () => {
    const old = fakeMatch('KR_1');
    delete old.info.gameEndTimestamp;
    old.info.gameDuration = 1_834_400;
    const { service } = setUp([old]);

    const page = await service.getPage({ ...PAGE, start: 0 });

    expect(page?.matches[0]?.durationSeconds).toBe(1834);
  });

  it('leaves out a match Riot no longer has, and logs one the player is not in', async () => {
    const { riot, log, service } = setUp([
      fakeMatch('KR_3'),
      fakeMatch('KR_2', { puuid: 'someone-else' }),
      fakeMatch('KR_1'),
    ]);
    riot.getMatch.mockImplementation((_platform, id) =>
      Promise.resolve(
        id === 'KR_1'
          ? null
          : fakeMatch(id, id === 'KR_2' ? { puuid: 'someone-else' } : {}),
      ),
    );

    const page = await service.getPage({ ...PAGE, start: 0 });

    expect(page?.matches.map((match) => match.id)).toEqual(['KR_3']);
    expect(log.warn.mock.calls).toMatchObject([
      [
        { matchId: 'KR_2' },
        'The player is not among the participants of one of their matches',
      ],
    ]);
  });

  it('gives the start of the next page, or null after the last one', async () => {
    const ids = Array.from(
      { length: MATCHES_PER_PAGE + 3 },
      (_, index) => `KR_${String(100 - index)}`,
    );
    const { service } = setUp(ids.map((id) => fakeMatch(id)));

    const first = await service.getPage({ ...PAGE, start: 0 });
    const last = await service.getPage({ ...PAGE, start: MATCHES_PER_PAGE });

    expect(first?.matches).toHaveLength(MATCHES_PER_PAGE);
    expect(first?.nextStart).toBe(MATCHES_PER_PAGE);
    expect(last?.matches).toHaveLength(3);
    expect(last?.nextStart).toBeNull();
  });

  it('returns null when no account has this Riot ID', async () => {
    const { riot, service } = setUp([]);
    riot.getAccountByRiotId.mockResolvedValue(null);

    expect(await service.getPage({ ...PAGE, start: 0 })).toBeNull();
    expect(riot.getMatchIdsByPuuid).not.toHaveBeenCalled();
  });
});
