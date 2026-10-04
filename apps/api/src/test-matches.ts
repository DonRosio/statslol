// Matches as Riot sends them, for the tests: the fields the API reads, and a few others.
import type { RiotMatch } from '@statslol/riot-client';

export const PLAYER_PUUID = 'fake-puuid'.padEnd(78, '0');

type Participant = RiotMatch['info']['participants'][number];

/** A finished match of PLAYER_PUUID (and of 9 other players), with what Riot says of them. */
export function fakeMatch(
  id: string,
  player: Partial<Participant> = {},
): RiotMatch {
  const participant = (puuid: string, index: number): Participant => ({
    puuid,
    championId: 517,
    championName: 'Sylas',
    kills: 7,
    deaths: 2,
    assists: 9,
    totalMinionsKilled: 180,
    neutralMinionsKilled: 12,
    teamPosition: 'MIDDLE',
    win: index < 5,
    gameEndedInEarlySurrender: false,
    placement: 0,
    // Some of the ~150 other fields, which the API keeps without reading them.
    item0: 3147,
    challenges: { kda: 8 },
  });
  return {
    metadata: { dataVersion: '2', matchId: id, participants: [] },
    info: {
      gameMode: 'CLASSIC',
      gameStartTimestamp: Date.UTC(2026, 9, 3, 16, 41, 12),
      gameEndTimestamp: Date.UTC(2026, 9, 3, 17, 11, 46),
      gameDuration: 1834,
      queueId: 420,
      participants: [
        { ...participant(PLAYER_PUUID, 0), ...player },
        ...Array.from({ length: 9 }, (_, index) =>
          participant(`other-puuid-${String(index)}`, index + 1),
        ),
      ],
    },
  };
}
