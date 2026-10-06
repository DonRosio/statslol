import { championRecords, type ChampionGame } from '@statslol/core';
import type { RiotClient, RiotMatch } from '@statslol/riot-client';
import { isArenaGame, type ChampionRecords } from '@statslol/shared';

import type { MatchStore } from '../db/matches.ts';
import {
  durationSecondsOf,
  placementOf,
  positionOf,
  resultOf,
} from './match-fields.ts';

/**
 * How many matches the statistics are made of, at most: the most recent ones. A player has
 * a few hundred of them, and each is read whole from the database (about 50 KB).
 */
export const MAX_STORED_MATCHES = 500;

export interface ChampionStatsService {
  /**
   * What a player did with each champion, from the matches already stored in the database
   * (the ones their history loaded): nothing is fetched from Riot, except the account.
   * Returns null if no account has this Riot ID.
   */
  getRecords(request: {
    readonly gameName: string;
    readonly tagLine: string;
  }): Promise<ChampionRecords | null>;
}

export function createChampionStatsService({
  riot,
  store,
  keyGeneration,
}: {
  readonly riot: Pick<RiotClient, 'getAccountByRiotId'>;
  readonly store: MatchStore;
  readonly keyGeneration: number;
}): ChampionStatsService {
  return {
    async getRecords({ gameName, tagLine }) {
      const account = await riot.getAccountByRiotId({ gameName, tagLine });
      if (account === null) return null;

      const matches = await store.findByPuuid(
        account.puuid,
        keyGeneration,
        MAX_STORED_MATCHES,
      );
      return {
        records: championRecords(
          matches.flatMap((match) => gameOf(match, account.puuid)),
        ),
      };
    },
  };
}

/**
 * The game of a match for a player, if it counts for the champion statistics: not an Arena
 * game (it has a tab of its own, and no positions), and the player did play it.
 */
function gameOf(match: RiotMatch, puuid: string): ChampionGame[] {
  const player = match.info.participants.find(
    (participant) => participant.puuid === puuid,
  );
  if (player === undefined) return [];
  const { queueId } = match.info;
  if (isArenaGame({ queueId, placement: placementOf(player) })) return [];

  return [
    {
      queueId,
      championId: player.championId,
      championName: player.championName,
      position: positionOf(player),
      result: resultOf(player),
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      creepScore: player.totalMinionsKilled + player.neutralMinionsKilled,
      durationSeconds: durationSecondsOf(match.info),
    },
  ];
}
