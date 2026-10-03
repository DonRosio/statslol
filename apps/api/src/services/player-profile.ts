import {
  RiotApiError,
  type RiotClient,
  type RiotLeagueEntry,
} from '@statslol/riot-client';
import {
  divisionSchema,
  tierSchema,
  type PlayerProfile,
  type Rank,
  type Region,
} from '@statslol/shared';

import { PLATFORM_BY_REGION } from './platforms.ts';

const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

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
      solo: findRank(entries, 'RANKED_SOLO_5x5'),
      flex: findRank(entries, 'RANKED_FLEX_SR'),
    },
  };
}

function findRank(
  entries: readonly RiotLeagueEntry[],
  queueType: string,
): Rank | null {
  const entry = entries.find((candidate) => candidate.queueType === queueType);
  if (entry === undefined) return null;

  // Riot calls the division "rank".
  const tier = tierSchema.safeParse(entry.tier);
  const division = divisionSchema.safeParse(entry.rank);
  if (!tier.success || !division.success) {
    throw new RiotApiError(
      'unexpected-response',
      `Unknown rank from Riot: ${entry.tier} ${entry.rank}`,
    );
  }
  return {
    tier: tier.data,
    // Riot gives "I" to Master and above, which have no divisions.
    division: APEX_TIERS.has(tier.data) ? null : division.data,
    leaguePoints: entry.leaguePoints,
    wins: entry.wins,
    losses: entry.losses,
  };
}
