import {
  championRecordsSchema,
  matchHistorySchema,
  playerProfileSchema,
  type MatchHistory,
  type MatchSummary,
  type PlayerParams,
} from '@statslol/shared';
import {
  infiniteQueryOptions,
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query';
import { generatePath } from 'react-router';

import { getJson, post } from './client.ts';

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

/**
 * GET /api/v1/players/:region/:name/:tag/champions: what the player did with each champion,
 * added up from the matches stored on the site (the ones their history loaded), by mode and
 * position.
 */
export function championStatsQuery(player: PlayerParams) {
  return queryOptions({
    queryKey: [...playerKey(player), 'champions'],
    queryFn: ({ signal }) =>
      getJson(
        `${playerApiPath(player)}/champions`,
        championRecordsSchema,
        signal,
      ),
    // Cheap to ask (the API only reads its database), and the history grows the stored
    // matches: the tab asks again each time it opens.
    staleTime: 0,
  });
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
