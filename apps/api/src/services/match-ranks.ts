import type { RiotClient } from '@statslol/riot-client';
import type { MatchRanks, Region } from '@statslol/shared';
import type { FastifyBaseLogger } from 'fastify';

import type { MatchLoader } from './match-loader.ts';
import { PLATFORM_BY_REGION } from './platforms.ts';
import { findRank, rankQueueOf } from './rank.ts';

export interface MatchRanksService {
  /**
   * The rank of every player of a match, or null if Riot does not have the match: the one of
   * Ranked Flex in a Ranked Flex game, the solo/duo rank in any other. One call to Riot for each player, unless their rank was asked recently (the cache
   * of the Riot client keeps it for a few minutes).
   */
  getRanks(request: {
    readonly region: Region;
    readonly matchId: string;
  }): Promise<MatchRanks | null>;
}

export function createMatchRanksService({
  matches,
  riot,
  log,
}: {
  readonly matches: MatchLoader;
  readonly riot: Pick<RiotClient, 'getLeagueEntriesByPuuid'>;
  readonly log: FastifyBaseLogger;
}): MatchRanksService {
  return {
    async getRanks({ region, matchId }) {
      const platform = PLATFORM_BY_REGION[region];
      const [match] = await matches.getMany(platform, [matchId]);
      if (match === undefined || match === null) return null;

      const queue = rankQueueOf(match.info.queueId);
      // The calls are sent at the same time: the Riot client spaces them out to respect its
      // limits. A player whose rank cannot be had (limit reached, Riot down) is left out of
      // the answer, so that it is not taken for "unranked", and the others are still given.
      const entries = await Promise.all(
        match.info.participants.map(async (participant) => {
          try {
            const leagues = await riot.getLeagueEntriesByPuuid(
              platform,
              participant.puuid,
            );
            return [
              participant.participantId,
              findRank(leagues, queue),
            ] as const;
          } catch (error) {
            log.warn(
              { err: error, matchId },
              'The rank of a player of a match could not be had',
            );
            return null;
          }
        }),
      );
      return {
        ranks: Object.fromEntries(entries.filter((entry) => entry !== null)),
      };
    },
  };
}
