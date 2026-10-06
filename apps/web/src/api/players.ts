import {
  championStatsSchema,
  seasonSyncSchema,
  matchHistorySchema,
  playerProfileSchema,
  type MatchHistory,
  type MatchSummary,
  type PlayerParams,
  type SeasonId,
} from '@statslol/shared';
import {
  infiniteQueryOptions,
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query';
import { generatePath } from 'react-router';

import { getJson, post, postJson } from './client.ts';

/**
 * URL of a player in the API, e.g. /api/v1/players/kr/Hide%20on%20bush/KR1. Each part is
 * percent-encoded, like in the URL of the profile page.
 */
function playerApiPath(player: PlayerParams): string {
  return generatePath('/api/v1/players/:region/:name/:tag', player);
}

/**
 * Start of the cache keys of everything about a player: the "Update" button will refresh
 * all of it at once.
 */
function playerKey({ region, name, tag }: PlayerParams) {
  return ['players', region, name, tag] as const;
}

/** GET /api/v1/players/:region/:name/:tag: level, icon and ranks of a player. */
export function playerProfileQuery(player: PlayerParams) {
  return queryOptions({
    queryKey: [...playerKey(player), 'profile'],
    queryFn: ({ signal }) =>
      getJson(playerApiPath(player), playerProfileSchema, signal),
    // The API keeps ranks for 5 minutes: asking again sooner would get the same answer.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * GET /api/v1/players/:region/:name/:tag/matches: the match history of a player, one page
 * at a time. Each page gives the `start` of the next one, or null after the last one.
 */
export function matchHistoryQuery(player: PlayerParams) {
  return infiniteQueryOptions({
    queryKey: [...playerKey(player), 'matches'],
    queryFn: ({ pageParam, signal }) =>
      getJson(
        `${playerApiPath(player)}/matches?${new URLSearchParams({ start: String(pageParam) }).toString()}`,
        matchHistorySchema,
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextStart,
    // The API keeps the list of the latest matches for 2 minutes.
    staleTime: 2 * 60 * 1000,
  });
}

/** Start of the cache keys of the champion statistics of a player, whatever the season. */
function championsKey(player: PlayerParams) {
  return [...playerKey(player), 'champions'] as const;
}

/**
 * GET /api/v1/players/:region/:name/:tag/champions?season=: what the player did with each
 * champion in a season, by mode and position, from the games the site has stored (the
 * loading of the others is `seasonSyncQuery`'s).
 */
export function championStatsQuery(player: PlayerParams, season: SeasonId) {
  return queryOptions({
    queryKey: [...championsKey(player), season],
    queryFn: ({ signal }) =>
      getJson(
        `${playerApiPath(player)}/champions?${new URLSearchParams({ season }).toString()}`,
        championStatsSchema,
        signal,
      ),
    // Cheap to ask (the API only reads its database), and the games keep coming while the
    // season loads: the tab asks again each time it opens.
    staleTime: 0,
  });
}

/**
 * GET /api/v1/players/:region/:name/:tag/champions/sync?season=: how the loading of the
 * season's games is going on the server.
 */
export function seasonSyncQuery(player: PlayerParams, season: SeasonId) {
  return queryOptions({
    queryKey: [...championsKey(player), season, 'sync'],
    queryFn: ({ signal }) =>
      getJson(
        `${playerApiPath(player)}/champions/sync?${new URLSearchParams({ season }).toString()}`,
        seasonSyncSchema,
        signal,
      ),
    staleTime: 0,
  });
}

/**
 * POST /api/v1/players/:region/:name/:tag/champions/sync?season=: asks the server to load
 * the games of the season it does not have yet. It answers at once with how it is going;
 * asking again while it runs (or just after) changes nothing.
 */
export function startSeasonSync(player: PlayerParams, season: SeasonId) {
  return postJson(
    `${playerApiPath(player)}/champions/sync?${new URLSearchParams({ season }).toString()}`,
    seasonSyncSchema,
  );
}

/**
 * POST /api/v1/players/:region/:name/:tag/refresh, the "Update" button: the API forgets what
 * it knows about the player. Fails with a 429 ApiError during the cooldown.
 */
export function refreshPlayer(player: PlayerParams): Promise<void> {
  return post(`${playerApiPath(player)}/refresh`);
}

/**
 * After an update, asks the API again for the player's profile and matches. Only the first
 * page of matches is kept: asking again for each loaded page would cost calls to Riot for
 * matches that cannot have changed.
 */
export async function reloadPlayer(
  queryClient: QueryClient,
  player: PlayerParams,
): Promise<void> {
  queryClient.setQueryData(matchHistoryQuery(player).queryKey, (history) =>
    history === undefined
      ? undefined
      : {
          pages: history.pages.slice(0, 1),
          pageParams: history.pageParams.slice(0, 1),
        },
  );
  await queryClient.invalidateQueries({ queryKey: playerKey(player) });
}

/**
 * The matches of all the loaded pages, each one once. Pages are cut by position in the
 * history: when the player finishes a game between two pages, the next page starts with
 * the last match of the previous one.
 */
export function uniqueMatches(pages: readonly MatchHistory[]): MatchSummary[] {
  const seen = new Set<string>();
  return pages
    .flatMap((page) => page.matches)
    .filter((match) => {
      if (seen.has(match.id)) return false;
      seen.add(match.id);
      return true;
    });
}
