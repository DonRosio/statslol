import type { ChampionRecord } from '@statslol/shared';

/** One game of a player, with what the statistics of a champion are made of. */
export interface ChampionGame {
  readonly queueId: number;
  readonly championId: number;
  /** Riot's internal name, used to find the champion in Data Dragon. */
  readonly championName: string;
  /** TOP, JUNGLE, MIDDLE, BOTTOM or UTILITY; null in modes without positions. */
  readonly position: string | null;
  readonly result: 'win' | 'loss' | 'remake';
  /** Arena: the place of the team (1 to 6); null in the other modes. */
  readonly placement: number | null;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  /** Minions and monsters killed. */
  readonly creepScore: number;
  readonly durationSeconds: number;
}

/**
 * Adds up the games of a player: one record per champion, mode and position. A remake counts
 * for nothing: it was abandoned in its first minutes, and is left out.
 */
export function championRecords(
  games: readonly ChampionGame[],
): ChampionRecord[] {
  const records = new Map<string, ChampionRecord>();
  for (const game of games) {
    if (game.result === 'remake') continue;
    const key = `${String(game.championId)}/${String(game.queueId)}/${game.position ?? ''}`;
    const record = records.get(key);
    records.set(key, {
      championId: game.championId,
      championName: game.championName,
      queueId: game.queueId,
      position: game.position,
      games: (record?.games ?? 0) + 1,
      wins: (record?.wins ?? 0) + (game.result === 'win' ? 1 : 0),
      kills: (record?.kills ?? 0) + game.kills,
      deaths: (record?.deaths ?? 0) + game.deaths,
      assists: (record?.assists ?? 0) + game.assists,
      creepScore: (record?.creepScore ?? 0) + game.creepScore,
      durationSeconds: (record?.durationSeconds ?? 0) + game.durationSeconds,
      placementSum: (record?.placementSum ?? 0) + (game.placement ?? 0),
    });
  }
  return [...records.values()];
}

/** Which records to add up. Without a field, no limit on it. */
export interface RecordFilter {
  /** Only these modes (Riot's queue IDs). */
  readonly queueIds?: ReadonlySet<number>;
  /** Only this position (TOP, JUNGLE, MIDDLE, BOTTOM or UTILITY). */
  readonly position?: string;
}

/** A champion and what the player did with it: the totals, and the averages per game. */
export interface ChampionStats {
  readonly championId: number;
  readonly championName: string;
  readonly games: number;
  readonly wins: number;
  readonly losses: number;
  /** Percentage of games won, rounded. */
  readonly winRate: number;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  readonly creepScore: number;
  readonly durationSeconds: number;
  /** Arena: the average place (1 is the best); null when no game has a place. */
  readonly averagePlacement: number | null;
  readonly averageKills: number;
  readonly averageDeaths: number;
  readonly averageAssists: number;
  readonly averageCreepScore: number;
}

/**
 * The statistics of each champion played, from the records that pass the filter. The most
 * played champion first; between two of them, the one that won the most, then by name.
 */
export function championStats(
  records: readonly ChampionRecord[],
  filter: RecordFilter = {},
): ChampionStats[] {
  const byChampion = new Map<number, ChampionRecord[]>();
  for (const record of records) {
    if (filter.queueIds !== undefined && !filter.queueIds.has(record.queueId)) {
      continue;
    }
    if (filter.position !== undefined && record.position !== filter.position) {
      continue;
    }
    byChampion.set(record.championId, [
      ...(byChampion.get(record.championId) ?? []),
      record,
    ]);
  }

  return [...byChampion.values()]
    .map((group) => statsOf(group))
    .sort(
      (a, b) =>
        b.games - a.games ||
        b.wins - a.wins ||
        a.championName.localeCompare(b.championName),
    );
}

/** Adds up the records of one champion (there is at least one). */
function statsOf(group: readonly ChampionRecord[]): ChampionStats {
  const sum = (
    field:
      | 'games'
      | 'wins'
      | 'kills'
      | 'deaths'
      | 'assists'
      | 'creepScore'
      | 'durationSeconds'
      | 'placementSum',
  ) => group.reduce((total, record) => total + record[field], 0);
  const games = sum('games');
  const placementSum = sum('placementSum');
  // Only the Arena records carry places, and each of their games has one: the places are
  // averaged over those games, not over the games of other modes the records may hold.
  const placedGames = group
    .filter((record) => record.placementSum > 0)
    .reduce((total, record) => total + record.games, 0);
  const wins = sum('wins');
  const [kills, deaths, assists, creepScore] = [
    sum('kills'),
    sum('deaths'),
    sum('assists'),
    sum('creepScore'),
  ];
  return {
    championId: group[0]?.championId ?? 0,
    championName: group[0]?.championName ?? '',
    games,
    wins,
    losses: games - wins,
    winRate: Math.round((wins / games) * 100),
    kills,
    deaths,
    assists,
    creepScore,
    durationSeconds: sum('durationSeconds'),
    averagePlacement: placedGames === 0 ? null : placementSum / placedGames,
    averageKills: kills / games,
    averageDeaths: deaths / games,
    averageAssists: assists / games,
    averageCreepScore: creepScore / games,
  };
}
