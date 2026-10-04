import { REFRESH_COOLDOWN_SECONDS, type Region } from '@statslol/shared';

import type { Cache } from '../cache/cache.ts';
import type { CachedRiotClient } from '../cache/riot-client.ts';
import { PLATFORM_BY_REGION } from './platforms.ts';

export type RefreshResult =
  | { readonly outcome: 'refreshed' }
  | { readonly outcome: 'too-soon'; readonly retryAfterSeconds: number }
  | { readonly outcome: 'not-found' };

/**
 * Forgets what the cache knows about a player ("Update" button): their next lookups get
 * fresh data from Riot. Stored matches are kept: a finished match never changes.
 */
export async function refreshPlayer(
  { riot, cache }: { readonly riot: CachedRiotClient; readonly cache: Cache },
  {
    region,
    gameName,
    tagLine,
  }: {
    readonly region: Region;
    readonly gameName: string;
    readonly tagLine: string;
  },
): Promise<RefreshResult> {
  const account = await riot.getAccountByRiotId({ gameName, tagLine });
  if (account === null) return { outcome: 'not-found' };

  const platform = PLATFORM_BY_REGION[region];
  const retryAfterSeconds = await cache.startCooldown(
    `refresh:${platform}:${account.puuid}`,
    REFRESH_COOLDOWN_SECONDS,
  );
  if (retryAfterSeconds > 0) return { outcome: 'too-soon', retryAfterSeconds };

  await riot.forgetPlayer({
    riotId: { gameName, tagLine },
    platform,
    puuid: account.puuid,
  });
  return { outcome: 'refreshed' };
}
