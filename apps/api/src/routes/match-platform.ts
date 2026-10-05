import type { MatchParams } from '@statslol/shared';
import type { Platform } from '@statslol/riot-client';

import { HttpError } from '../errors.ts';
import { PLATFORM_BY_REGION } from '../services/platforms.ts';

/**
 * The platform of a match asked by region and ID. "EUW1_7123456789" is a match of the platform
 * euw1: asking Riot for it on another server would only fail, and cost a call, so a match
 * of another server is refused here with a 400.
 */
export function platformOfMatch({ region, matchId }: MatchParams): Platform {
  const platform = PLATFORM_BY_REGION[region];
  if (!matchId.startsWith(`${platform.toUpperCase()}_`)) {
    throw new HttpError(400, 'This match was not played on this server');
  }
  return platform;
}
