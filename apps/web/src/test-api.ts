import type { MatchHistory } from '@statslol/shared';
import { http, HttpResponse, type HttpResponseResolver } from 'msw';

import {
  ARAM_MATCH,
  arenaDetails,
  ARENA_MATCH,
  classicDetails,
  classicRanks,
  matchSummary,
  PROFILE,
  STATIC_DATA,
} from './test-data.ts';
import { server } from './test-server.ts';

// The fake API of the profile page's tests (MSW): Hide on bush#KR1 and 2 matches.

/** Answers each page of matches by its `start`; any other page is an error. */
export function matchPages(
  pages: Readonly<Record<number, MatchHistory>>,
): HttpResponseResolver {
  return ({ request }) => {
    const start = Number(new URL(request.url).searchParams.get('start'));
    const page = pages[start];
    return page === undefined
      ? new HttpResponse(null, { status: 500 })
      : HttpResponse.json(page);
  };
}

/** An unexpected error of the API. */
export const failure: HttpResponseResolver = () =>
  new HttpResponse(null, { status: 500 });

/**
 * Plays the API for any player: by default, PROFILE, one page of 2 matches (a ranked game and an ARAM game), the static
 * data, the details of a match, and updates that succeed (204).
 */
export function mockPlayerApi({
  profile = () => HttpResponse.json(PROFILE),
  matches = matchPages({
    0: { matches: [matchSummary('KR_3'), ARAM_MATCH], nextStart: null },
  }),
  staticData = () => HttpResponse.json(STATIC_DATA),
  refresh = () => new HttpResponse(null, { status: 204 }),
  matchDetails = ({ params }) =>
    HttpResponse.json(
      String(params.matchId) === ARENA_MATCH.id
        ? arenaDetails(ARENA_MATCH.id)
        : classicDetails(String(params.matchId)),
    ),
  matchRanks = () => HttpResponse.json(classicRanks()),
}: {
  profile?: HttpResponseResolver;
  matches?: HttpResponseResolver;
  staticData?: HttpResponseResolver;
  refresh?: HttpResponseResolver;
  matchDetails?: HttpResponseResolver;
  matchRanks?: HttpResponseResolver;
} = {}) {
  server.use(
    http.get('/api/v1/players/:region/:name/:tag', profile),
    http.get('/api/v1/players/:region/:name/:tag/matches', matches),
    http.post('/api/v1/players/:region/:name/:tag/refresh', refresh),
    http.get('/api/v1/static-data', staticData),
    http.get('/api/v1/matches/:region/:matchId', matchDetails),
    http.get('/api/v1/matches/:region/:matchId/ranks', matchRanks),
  );
}
