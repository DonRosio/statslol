import {
  matchDetailsSchema,
  matchRanksSchema,
  type Region,
} from '@statslol/shared';
import { queryOptions } from '@tanstack/react-query';

import { getJson } from './client.ts';

/**
 * GET /api/v1/matches/:region/:matchId: the teams of a finished game and all their players.
 * Asked when the details of a match are opened.
 */
export function matchDetailsQuery(region: Region, matchId: string) {
  return queryOptions({
    queryKey: ['matches', region, matchId],
    queryFn: ({ signal }) =>
      getJson(
        `/api/v1/matches/${region}/${encodeURIComponent(matchId)}`,
        matchDetailsSchema,
        signal,
      ),
    // A finished game never changes: once loaded, the details are kept as they are.
    staleTime: Infinity,
  });
}

/**
 * GET /api/v1/matches/:region/:matchId/ranks: the solo rank of each player of a match. Asked
 * after the details, in the background: it costs calls to Riot, and the details do not wait.
 */
export function matchRanksQuery(region: Region, matchId: string) {
  return queryOptions({
    queryKey: ['matches', region, matchId, 'ranks'],
    queryFn: ({ signal }) =>
      getJson(
        `/api/v1/matches/${region}/${encodeURIComponent(matchId)}/ranks`,
        matchRanksSchema,
        signal,
      ),
    // A rank changes slowly, and the API keeps it for a few minutes.
    staleTime: 10 * 60 * 1000,
  });
}
