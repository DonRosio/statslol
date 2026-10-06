import type { MatchHistory } from '@statslol/shared';

import {
  ARAM_MATCH,
  CHAMPION_RECORDS,
  CURRENT_SEASON,
  MASTERY,
  SYNC_DONE,
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
    matches: [matchSummary('KR_3'), ARAM_MATCH],
    nextStart: null,
  },
): void {
  api.answer(PLAYER_API_PATH, PROFILE);
  api.answer(`${PLAYER_API_PATH}/matches?start=0`, firstPage);
  api.answer(`${PLAYER_API_PATH}/champions?season=${CURRENT_SEASON.id}`, {
    season: CURRENT_SEASON.id,
    records: CHAMPION_RECORDS,
  });
  api.answer(
    `${PLAYER_API_PATH}/champions/sync?season=${CURRENT_SEASON.id}`,
    SYNC_DONE,
  );
  api.answer(
    `${PLAYER_API_PATH}/champions/sync?season=${CURRENT_SEASON.id}`,
    SYNC_DONE,
    {
      method: 'POST',
    },
  );
  api.answer(`${PLAYER_API_PATH}/mastery`, MASTERY);
  api.answer('/api/v1/static-data', STATIC_DATA);
}
