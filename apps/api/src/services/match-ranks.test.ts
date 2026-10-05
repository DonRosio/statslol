import type { RiotClient, RiotLeagueEntry } from '@statslol/riot-client';
import { describe, expect, it, vi } from 'vitest';

import { MemoryMatchStore } from '../db/memory-match-store.ts';
import { fakeLogger } from '../test-logger.ts';
import { fakeMatch, PLAYER_PUUID } from '../test-matches.ts';
import { createMatchLoader } from './match-loader.ts';
import { createMatchRanksService } from './match-ranks.ts';

const SOLO = (tier: string, rank: string): RiotLeagueEntry => ({
  queueType: 'RANKED_SOLO_5x5',
  tier,
  rank,
  leaguePoints: 59,
  wins: 23,
  losses: 26,
});

const FLEX = (tier: string, rank: string): RiotLeagueEntry => ({
  ...SOLO(tier, rank),
  queueType: 'RANKED_FLEX_SR',
});

async function setUp(
  entriesOf: (puuid: string) => Promise<RiotLeagueEntry[]>,
  queueId = 420,
) {
  const store = new MemoryMatchStore();
  const match = fakeMatch('KR_1');
  match.info.queueId = queueId;
  await store.save(match, 1);
  const riot = {
    getLeagueEntriesByPuuid: vi.fn<RiotClient['getLeagueEntriesByPuuid']>(
      (_platform, puuid) => entriesOf(puuid),
    ),
  };
  const log = fakeLogger();
  const service = createMatchRanksService({
    matches: createMatchLoader({
      riot: { getMatch: () => Promise.resolve(null) },
      store,
      keyGeneration: 1,
    }),
    riot,
    log,
  });
  return { riot, log, service };
}

describe('getRanks', () => {
  it('gives the solo rank of every player, by participantId', async () => {
    const { service } = await setUp((puuid) =>
      Promise.resolve([
        // The flex rank is not the one that is meant.
        {
          queueType: 'RANKED_FLEX_SR',
          tier: 'GOLD',
          rank: 'IV',
          leaguePoints: 0,
          wins: 1,
          losses: 1,
        },
        puuid === PLAYER_PUUID ? SOLO('DIAMOND', 'I') : SOLO('EMERALD', 'II'),
      ]),
    );

    const result = await service.getRanks({ region: 'kr', matchId: 'KR_1' });

    expect(Object.keys(result?.ranks ?? {})).toHaveLength(10);
    expect(result?.ranks['1']).toEqual({
      tier: 'DIAMOND',
      division: 'I',
      leaguePoints: 59,
      wins: 23,
      losses: 26,
    });
    expect(result?.ranks['2']).toMatchObject({
      tier: 'EMERALD',
      division: 'II',
    });
  });

  it('gives the flex rank in a Ranked Flex game, null for a player with none', async () => {
    const { service } = await setUp(
      (puuid) =>
        Promise.resolve(
          puuid === PLAYER_PUUID
            ? [SOLO('DIAMOND', 'I'), FLEX('GOLD', 'IV')]
            : [SOLO('EMERALD', 'II')],
        ),
      440,
    );

    const result = await service.getRanks({ region: 'kr', matchId: 'KR_1' });

    expect(result?.ranks['1']).toMatchObject({ tier: 'GOLD', division: 'IV' });
    // Solo rank only: no flex rank, so none here.
    expect(result?.ranks['2']).toBeNull();
  });

  it.each([
    ['Normal Draft', 400],
    ['ARAM', 450],
    ['Arena', 1700],
  ])('gives the solo rank in %s', async (_name, queueId) => {
    const { service } = await setUp(
      () => Promise.resolve([SOLO('DIAMOND', 'I'), FLEX('GOLD', 'IV')]),
      queueId,
    );

    const result = await service.getRanks({ region: 'kr', matchId: 'KR_1' });

    expect(result?.ranks['1']).toMatchObject({
      tier: 'DIAMOND',
      division: 'I',
    });
  });

  it('gives null for a player with no solo rank, and no division for Master and above', async () => {
    const { service } = await setUp((puuid) =>
      Promise.resolve(puuid === PLAYER_PUUID ? [] : [SOLO('MASTER', 'I')]),
    );

    const result = await service.getRanks({ region: 'kr', matchId: 'KR_1' });

    expect(result?.ranks['1']).toBeNull();
    expect(result?.ranks['2']).toMatchObject({
      tier: 'MASTER',
      division: null,
    });
  });

  it('asks Riot once for each player, with their PUUID, on the platform of the match', async () => {
    const { riot, service } = await setUp(() => Promise.resolve([]));

    await service.getRanks({ region: 'kr', matchId: 'KR_1' });

    expect(riot.getLeagueEntriesByPuuid).toHaveBeenCalledTimes(10);
    expect(riot.getLeagueEntriesByPuuid).toHaveBeenCalledWith(
      'kr',
      PLAYER_PUUID,
    );
  });

  it('leaves out a player whose rank cannot be had, and gives the others', async () => {
    const { service, log } = await setUp((puuid) =>
      puuid === PLAYER_PUUID
        ? Promise.reject(new Error('rate limited'))
        : Promise.resolve([SOLO('GOLD', 'III')]),
    );

    const result = await service.getRanks({ region: 'kr', matchId: 'KR_1' });

    // Left out, not "unranked": the player may well have a rank.
    expect('1' in (result?.ranks ?? {})).toBe(false);
    expect(Object.keys(result?.ranks ?? {})).toHaveLength(9);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('leaves out a player whose rank Riot gives in a way we do not know', async () => {
    const { service } = await setUp((puuid) =>
      Promise.resolve(puuid === PLAYER_PUUID ? [SOLO('ABYSS', 'I')] : []),
    );

    const result = await service.getRanks({ region: 'kr', matchId: 'KR_1' });

    expect('1' in (result?.ranks ?? {})).toBe(false);
  });

  it('gives null for a match Riot does not have', async () => {
    const { riot, service } = await setUp(() => Promise.resolve([]));

    expect(
      await service.getRanks({ region: 'kr', matchId: 'KR_9' }),
    ).toBeNull();
    expect(riot.getLeagueEntriesByPuuid).not.toHaveBeenCalled();
  });
});
