import type { MatchSummary } from '@statslol/shared';

/** The number of games the summary above the history counts. */
export const RECENT_GAMES = 20;

/** How many champions the summary lists. */
const TOP_CHAMPIONS = 3;

/** Kills, deaths and assists of a group of games, as totals. */
interface Totals {
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
}

/** What a group of games comes to: the record, and the average score. */
export interface GroupStats extends Totals {
  readonly games: number;
  readonly wins: number;
  readonly losses: number;
  /** Percentage of games won, rounded; null for no game. */
  readonly winRate: number | null;
  /** Average kills, deaths and assists per game. */
  readonly averageKills: number;
  readonly averageDeaths: number;
  readonly averageAssists: number;
}

/** A champion and what the player did with it. */
export interface ChampionStats extends GroupStats {
  readonly championId: number;
  /** Riot's internal name, used to find the champion in Data Dragon. */
  readonly championName: string;
}

export interface RecentStats extends GroupStats {
  /** The champions played the most, the most played first. */
  readonly champions: readonly ChampionStats[];
}

function groupStats(matches: readonly MatchSummary[]): GroupStats {
  const games = matches.length;
  const wins = matches.filter((match) => match.result === 'win').length;
  const sum = (field: 'kills' | 'deaths' | 'assists') =>
    matches.reduce((total, match) => total + match[field], 0);
  const [kills, deaths, assists] = [
    sum('kills'),
    sum('deaths'),
    sum('assists'),
  ];
  const average = (total: number) => (games === 0 ? 0 : total / games);
  return {
    games,
    wins,
    losses: games - wins,
    winRate: games === 0 ? null : Math.round((wins / games) * 100),
    kills,
    deaths,
    assists,
    averageKills: average(kills),
    averageDeaths: average(deaths),
    averageAssists: average(assists),
  };
}

/**
 * The summary of the first RECENT_GAMES games of a history (the most recent first): the
 * record, the average score, and the most played champions. A remake counts for nothing:
 * it is left out, and does not take a place among the games.
 */
export function recentStats(matches: readonly MatchSummary[]): RecentStats {
  const games = matches
    .filter((match) => match.result !== 'remake')
    .slice(0, RECENT_GAMES);

  const byChampion = new Map<number, MatchSummary[]>();
  for (const match of games) {
    byChampion.set(match.championId, [
      ...(byChampion.get(match.championId) ?? []),
      match,
    ]);
  }
  const champions = [...byChampion.values()]
    .map((played): ChampionStats => {
      const [first] = played;
      return {
        ...groupStats(played),
        championId: first?.championId ?? 0,
        championName: first?.championName ?? '',
      };
    })
    // The most played first; between two of them, the one that won the most; then the one
    // played most recently (the sort keeps the order of the history).
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
    .slice(0, TOP_CHAMPIONS);

  return { ...groupStats(games), champions };
}
