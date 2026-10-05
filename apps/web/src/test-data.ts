import type {
  MatchDetails,
  MatchParticipant,
  MatchSummary,
  PlayerProfile,
  StaticData,
} from '@statslol/shared';

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
    '2202': { id: 'SummonerCherryFlash', name: 'Flash' },
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
    level: 16,
    visionScore: 24,
    // Nothing but the result: tests that look at the spells, runes, items or players of a
    // match give them (LOADOUT, classicPlayers...).
    spellIds: [],
    runes: null,
    itemIds: [0, 0, 0, 0, 0, 0, 0],
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
});

/** Flash and Ignite, Lethal Tempo with Resolve, Trinity Force and a Stealth Ward. */
export const LOADOUT: Pick<MatchSummary, 'spellIds' | 'runes' | 'itemIds'> = {
  spellIds: [4, 14],
  runes: { keystoneId: 8008, secondaryStyleId: 8400 },
  itemIds: [3078, 0, 0, 0, 0, 0, 3340],
};

/** A player of a match; Hide on bush#KR1 with Sylas on the blue side, unless `fields` say otherwise. */
export function participant(
  fields: Partial<MatchParticipant> = {},
): MatchParticipant {
  return {
    participantId: 1,
    riotId: { gameName: 'Hide on bush', tagLine: 'KR1' },
    championId: 517,
    championName: 'Sylas',
    teamId: 100,
    subteamId: null,
    isPlayer: true,
    ...fields,
  };
}

/** The 10 players of a classic game: Hide on bush#KR1 first, then 4 allies and 5 opponents. */
export function classicPlayers(): MatchParticipant[] {
  return Array.from({ length: 10 }, (_, index) =>
    index === 0
      ? participant()
      : participant({
          participantId: index + 1,
          riotId: {
            gameName:
              index < 5 ? `Ally ${String(index)}` : `Rival ${String(index)}`,
            tagLine: 'KR1',
          },
          championId: 62,
          championName: 'MonkeyKing',
          teamId: index < 5 ? 100 : 200,
          isPlayer: false,
        }),
  );
}

/** The 18 players of an Arena game: 6 teams of 3, Hide on bush#KR1 in team 3. */
export function arenaPlayers(): MatchParticipant[] {
  return Array.from({ length: 18 }, (_, index) => {
    const subteamId = Math.floor(index / 3) + 1;
    return participant({
      participantId: index + 1,
      riotId: { gameName: `Duelist ${String(index)}`, tagLine: 'KR1' },
      championId: 62,
      championName: 'MonkeyKing',
      teamId: 100,
      subteamId,
      isPlayer: index === 6,
    });
  });
}

/**
 * The details of a match, as the API gives them: 2 teams of 5 players (those of
 * classicPlayers(), Hide on bush#KR1 being the player 1). The blue side wins; damage grows
 * with the number of the player, so that the most damage is dealt by the player 10.
 */
export function classicDetails(id: string): MatchDetails {
  const players = classicPlayers();
  const team = (teamId: number, result: 'win' | 'loss') => ({
    id: teamId,
    result,
    placement: null,
    kills: 30,
    gold: 52_300,
    objectives:
      teamId === 100
        ? { towers: 9, inhibitors: 1, dragons: 3, barons: 1, heralds: 0 }
        : { towers: 2, inhibitors: 0, dragons: 1, barons: 0, heralds: 1 },
    players: players
      .filter((one) => one.teamId === teamId)
      .map((one) => ({
        participantId: one.participantId,
        riotId: one.riotId,
        championId: one.championId,
        championName: one.championName,
        level: 14 + one.participantId,
        position: 'MIDDLE',
        spellIds: [4, 14],
        runes: { keystoneId: 8008, secondaryStyleId: 8400 },
        itemIds: [3078, 0, 0, 0, 0, 0, 3340],
        kills: 7,
        deaths: 2,
        assists: 9,
        creepScore: 192,
        damageToChampions: 10_000 * one.participantId,
        gold: 12_500,
        visionScore: 20 + one.participantId,
      })),
  });
  return {
    id,
    queueId: 420,
    startedAt: '2026-10-03T16:41:12.000Z',
    durationSeconds: 1834,
    teams: [team(100, 'win'), team(200, 'loss')],
  };
}

/** The details of the Arena match of ARENA_MATCH: 6 teams of 3, the player's team third. */
export function arenaDetails(id: string): MatchDetails {
  const players = arenaPlayers();
  const places = [3, 1, 2, 4, 5, 6];
  const teams = places
    .map((placement, index) => ({
      id: index + 1,
      result: placement <= 3 ? ('win' as const) : ('loss' as const),
      placement,
      kills: 20,
      gold: 40_000,
      objectives: null,
      players: players
        .filter((one) => one.subteamId === index + 1)
        .map((one) => ({
          participantId: one.participantId,
          riotId: one.riotId,
          championId: one.championId,
          championName: one.championName,
          level: 17,
          position: null,
          spellIds: [2202],
          runes: null,
          itemIds: [3078, 0, 0, 0, 0, 0, 3340],
          kills: 5,
          deaths: 3,
          assists: 4,
          creepScore: 0,
          damageToChampions: 8000,
          gold: 13_000,
          visionScore: 0,
        })),
    }))
    .sort((a, b) => a.placement - b.placement);
  return {
    id,
    queueId: 1750,
    startedAt: '2026-10-03T16:41:12.000Z',
    durationSeconds: 1105,
    teams,
  };
}
