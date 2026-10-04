import type { MatchSummary, PlayerProfile, StaticData } from '@statslol/shared';

// Answers of the API used by the tests (Vitest and Playwright): Hide on bush#KR1, on KR.

/** URL of the player's profile page. */
export const PLAYER_PAGE_PATH = '/players/kr/Hide%20on%20bush/KR1';

/** URL of the player in the API. */
export const PLAYER_API_PATH = '/api/v1/players/kr/Hide%20on%20bush/KR1';

export const PROFILE: PlayerProfile = {
  riotId: { gameName: 'Hide on bush', tagLine: 'KR1' },
  region: 'kr',
  profileIconId: 6,
  summonerLevel: 812,
  ranks: {
    solo: {
      tier: 'CHALLENGER',
      division: null,
      leaguePoints: 1342,
      wins: 120,
      losses: 80,
    },
    flex: null,
  },
};

export const STATIC_DATA: StaticData = {
  version: '16.19.1',
  champions: {
    '517': { id: 'Sylas', name: 'Sylas' },
    '62': { id: 'MonkeyKing', name: 'Wukong' },
  },
  items: {
    '3078': { name: 'Trinity Force' },
    '3340': { name: 'Stealth Ward' },
  },
  summonerSpells: {
    '4': { id: 'SummonerFlash', name: 'Flash' },
    '14': { id: 'SummonerDot', name: 'Ignite' },
  },
  runes: {
    '8008': {
      name: 'Lethal Tempo',
      icon: 'perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png',
    },
    '8400': { name: 'Resolve', icon: 'perk-images/Styles/7204_Resolve.png' },
  },
};

/** A match of the player: a ranked win in mid lane with Sylas, unless `fields` say otherwise. */
export function matchSummary(
  id: string,
  fields: Partial<MatchSummary> = {},
): MatchSummary {
  return {
    id,
    queueId: 420,
    startedAt: '2026-10-03T16:41:12.000Z',
    durationSeconds: 1834,
    result: 'win',
    placement: null,
    championId: 517,
    championName: 'Sylas',
    kills: 7,
    deaths: 2,
    assists: 9,
    creepScore: 192,
    position: 'MIDDLE',
    spellIds: [4, 14],
    runes: { keystoneId: 8008, secondaryStyleId: 8400 },
    itemIds: [3078, 0, 0, 0, 0, 0, 3340],
    // The players of the match are not shown yet.
    participants: [],
    ...fields,
  };
}

/** A third place in Arena with Wukong (Riot's internal name: MonkeyKing). */
export const ARENA_MATCH = matchSummary('KR_2', {
  queueId: 1750,
  durationSeconds: 1105,
  // The top half of the teams "win" in Arena.
  result: 'win',
  placement: 3,
  championId: 62,
  championName: 'MonkeyKing',
  kills: 11,
  deaths: 0,
  assists: 4,
  creepScore: 0,
  position: null,
  // Arena has one spell (Cherry Flash), and no runes.
  spellIds: [2202],
  runes: null,
});
