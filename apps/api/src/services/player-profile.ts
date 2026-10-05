import type { RiotClient } from '@statslol/riot-client';
import type { PlayerProfile, Region } from '@statslol/shared';

import { PLATFORM_BY_REGION } from './platforms.ts';
import { findRank, FLEX_QUEUE, SOLO_QUEUE } from './rank.ts';

/**
 * Builds the profile of a player: account (Riot ID → PUUID), then League of Legends profile
 * and ranks on the player's region. Returns null if there is no such player there.
 */
export async function getPlayerProfile(
  riot: RiotClient,
  {
    region,
    gameName,
    tagLine,
  }: { region: Region; gameName: string; tagLine: string },
): Promise<PlayerProfile | null> {
  const account = await riot.getAccountByRiotId({ gameName, tagLine });
  if (account === null) return null;

  const platform = PLATFORM_BY_REGION[region];
  // Both calls only need the PUUID: they are sent at the same time.
  const [summoner, entries] = await Promise.all([
    riot.getSummonerByPuuid(platform, account.puuid),
    riot.getLeagueEntriesByPuuid(platform, account.puuid),
  ]);
  // The Riot account exists, but has never played League of Legends on this region.
  if (summoner === null) return null;

  return {
    riotId: { gameName: account.gameName, tagLine: account.tagLine },
    region,
    profileIconId: summoner.profileIconId,
    summonerLevel: summoner.summonerLevel,
    // Other queues (e.g. RANKED_PREMADE_5x5, the "Ranked 5s" event of 2026) are left out.
    ranks: {
      solo: findRank(entries, SOLO_QUEUE),
      flex: findRank(entries, FLEX_QUEUE),
    },
  };
}
