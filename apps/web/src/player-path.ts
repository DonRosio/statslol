import type { PlayerParams } from '@statslol/shared';
import { generatePath } from 'react-router';

/** URL pattern of a player's profile page, e.g. /players/kr/Hide%20on%20bush/KR1. */
export const PLAYER_PATH = '/players/:region/:name/:tag';

/**
 * URL of a player's profile page. Each part is percent-encoded: a name can contain spaces,
 * "%", "?" or letters of any script, which must not change the structure of the URL.
 */
export function playerPath(player: PlayerParams): string {
  return generatePath(PLAYER_PATH, player);
}
