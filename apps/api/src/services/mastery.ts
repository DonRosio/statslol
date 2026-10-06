import type { RiotClient } from '@statslol/riot-client';
import type { PlayerMastery, Region } from '@statslol/shared';

import { PLATFORM_BY_REGION } from './platforms.ts';

export interface MasteryService {
  /**
   * The champion mastery of a player on a region: every champion they have played, the most
   * points first, and the totals. Returns null if no account has this Riot ID.
   */
  getMastery(request: {
    readonly region: Region;
    readonly gameName: string;
    readonly tagLine: string;
  }): Promise<PlayerMastery | null>;
}

export function createMasteryService({
  riot,
}: {
  readonly riot: Pick<
    RiotClient,
    'getAccountByRiotId' | 'getChampionMasteriesByPuuid'
  >;
}): MasteryService {
  return {
    async getMastery({ region, gameName, tagLine }) {
      const account = await riot.getAccountByRiotId({ gameName, tagLine });
      if (account === null) return null;

      const masteries = await riot.getChampionMasteriesByPuuid(
        PLATFORM_BY_REGION[region],
        account.puuid,
      );
      const champions = masteries
        .map((mastery) => ({
          championId: mastery.championId,
          level: mastery.championLevel,
          points: mastery.championPoints,
          // Riot says 0 for a champion it has no date for.
          lastPlayedAt:
            mastery.lastPlayTime > 0
              ? new Date(mastery.lastPlayTime).toISOString()
              : null,
          pointsSinceLastLevel: Math.max(
            0,
            mastery.championPointsSinceLastLevel,
          ),
          pointsUntilNextLevel: Math.max(
            0,
            mastery.championPointsUntilNextLevel,
          ),
        }))
        // Riot sends them in this order already; it is not promised.
        .sort((a, b) => b.points - a.points);
      return {
        score: champions.reduce((total, champion) => total + champion.level, 0),
        totalPoints: champions.reduce(
          (total, champion) => total + champion.points,
          0,
        ),
        champions,
      };
    },
  };
}
