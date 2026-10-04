import type { MatchHistory } from '@statslol/shared';

import {
  ARENA_MATCH,
  matchSummary,
  PLAYER_API_PATH,
  PROFILE,
  STATIC_DATA,
} from '../src/test-data.ts';
import type { FakeApi } from './fixtures.ts';

/** The API knows the player: profile, one page of matches (unless given), static data. */
export function knowPlayer(
  api: FakeApi,
  firstPage: MatchHistory = {
    matches: [matchSummary('KR_3'), ARENA_MATCH],
    nextStart: null,
  },
): void {
  api.answer(PLAYER_API_PATH, PROFILE);
  api.answer(`${PLAYER_API_PATH}/matches?start=0`, firstPage);
  api.answer('/api/v1/static-data', STATIC_DATA);
}
