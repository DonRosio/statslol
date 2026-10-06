import { championRecords, type ChampionGame } from '@statslol/core';
import type { RiotClient } from '@statslol/riot-client';
import {
  seasonById,
  seasonWindow,
  type ChampionStatsAnswer,
  type SeasonId,
} from '@statslol/shared';

import type { MatchStore, PlayerGame } from '../db/matches.ts';
import {
  durationSecondsOf,
  placementOf,
  positionOf,
  resultOf,
} from './match-fields.ts';

export interface ChampionStatsService {
  /**
   * What a player did with each champion in a season, from the games already stored in the
   * database (the loading of the others is the job of the season sync): nothing is fetched
   * from Riot, except the account. Returns null if no account has this Riot ID.
   */
  getStats(request: {
    readonly gameName: string;
    readonly tagLine: string;
    readonly season: SeasonId;
  }): Promise<ChampionStatsAnswer | null>;
}

export function createChampionStatsService({
  riot,
  store,
  keyGeneration,
  now = () => new Date(),
}: {
  readonly riot: Pick<RiotClient, 'getAccountByRiotId'>;
  readonly store: MatchStore;
  readonly keyGeneration: number;
  readonly now?: () => Date;
}): ChampionStatsService {
  return {
    async getStats({ gameName, tagLine, season }) {
      const account = await riot.getAccountByRiotId({ gameName, tagLine });
      if (account === null) return null;

      const games = await store.findPlayerGames(
        account.puuid,
        keyGeneration,
        seasonWindow(seasonById(season), now()),
      );
      return { season, records: championRecords(games.map(gameOf)) };
    },
  };
}

/** A stored game, as the statistics count it. */
function gameOf({
  queueId,
  gameDuration,
  gameEndTimestamp,
  participant,
}: PlayerGame): ChampionGame {
  return {
    queueId,
    championId: participant.championId,
    championName: participant.championName,
    position: positionOf(participant),
    result: resultOf(participant),
    placement: placementOf(participant),
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    creepScore:
      participant.totalMinionsKilled + participant.neutralMinionsKilled,
    durationSeconds: durationSecondsOf({ gameDuration, gameEndTimestamp }),
  };
}
