import { describe, expect, it } from 'vitest';

import { playerProfileSchema, type PlayerProfile } from './player-profile.ts';

const PROFILE: PlayerProfile = {
  riotId: { gameName: 'Hide on bush', tagLine: 'KR1' },
  region: 'kr',
  profileIconId: 6,
  summonerLevel: 800,
  ranks: {
    solo: {
      tier: 'CHALLENGER',
      division: null,
      leaguePoints: 1234,
      wins: 300,
      losses: 250,
    },
    flex: null,
  },
};

describe('playerProfileSchema', () => {
  it('accepts a profile', () => {
    expect(playerProfileSchema.parse(PROFILE)).toEqual(PROFILE);
  });

  it('leaves out the fields that are not part of the contract', () => {
    expect(
      playerProfileSchema.parse({ ...PROFILE, puuid: 'secret-ish' }),
    ).toEqual(PROFILE);
  });

  it('rejects a tier it does not know', () => {
    const ranks = {
      solo: { ...PROFILE.ranks.solo, tier: 'WOOD' },
      flex: null,
    };

    expect(playerProfileSchema.safeParse({ ...PROFILE, ranks }).success).toBe(
      false,
    );
  });
});
