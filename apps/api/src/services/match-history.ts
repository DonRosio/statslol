import type { RiotClient, RiotMatch } from '@statslol/riot-client';
import {
  MATCHES_PER_PAGE,
  type MatchHistory,
  type MatchParticipant,
  type MatchSummary,
  type Region,
} from '@statslol/shared';
import type { FastifyBaseLogger } from 'fastify';

import {
  durationSecondsOf,
  itemIdsOf,
  placementOf,
  positionOf,
  resultOf,
  riotIdOf,
  runesOf,
  spellIdsOf,
  subteamOf,
  type RiotParticipant,
} from './match-fields.ts';
import type { MatchLoader } from './match-loader.ts';
import { PLATFORM_BY_REGION } from './platforms.ts';

export interface MatchHistoryService {
  /**
   * One page of a player's match history, the most recent first: MATCHES_PER_PAGE matches,
   * after the first `start` ones. Returns null if no account has this Riot ID.
   */
  getPage(request: {
    readonly region: Region;
    readonly gameName: string;
    readonly tagLine: string;
    readonly start: number;
  }): Promise<MatchHistory | null>;
}

/**
 * Builds match histories. Riot gives the list of a player's match IDs; the matches
 * themselves come from the loader (the database, or Riot once).
 */
export function createMatchHistoryService({
  riot,
  matches: loader,
  log,
}: {
  readonly riot: RiotClient;
  readonly matches: MatchLoader;
  readonly log: FastifyBaseLogger;
}): MatchHistoryService {
  return {
    async getPage({ region, gameName, tagLine, start }) {
      const account = await riot.getAccountByRiotId({ gameName, tagLine });
      if (account === null) return null;

      const platform = PLATFORM_BY_REGION[region];
      const ids = await riot.getMatchIdsByPuuid(platform, account.puuid, {
        start,
        count: MATCHES_PER_PAGE,
      });
      const games = await loader.getMany(platform, ids);

      const matches = games.flatMap((game) => {
        // Riot listed the match, but does not have it any more: left out.
        if (game === null) return [];
        const summary = summarize(game, account.puuid);
        if (summary === null) {
          log.warn(
            { matchId: game.metadata.matchId },
            'The player is not among the participants of one of their matches',
          );
          return [];
        }
        return [summary];
      });
      return {
        matches,
        // Fewer IDs than asked for: this was the last page.
        nextStart:
          ids.length < MATCHES_PER_PAGE ? null : start + MATCHES_PER_PAGE,
      };
    },
  };
}

/** The match from the point of view of one of its players, or null if they did not play it. */
function summarize(match: RiotMatch, puuid: string): MatchSummary | null {
  const player = match.info.participants.find(
    (participant) => participant.puuid === puuid,
  );
  if (player === undefined) return null;

  return {
    id: match.metadata.matchId,
    queueId: match.info.queueId,
    startedAt: new Date(match.info.gameStartTimestamp).toISOString(),
    durationSeconds: durationSecondsOf(match.info),
    result: resultOf(player),
    placement: placementOf(player),
    championId: player.championId,
    championName: player.championName,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    creepScore: player.totalMinionsKilled + player.neutralMinionsKilled,
    position: positionOf(player),
    spellIds: spellIdsOf(player),
    runes: runesOf(player),
    itemIds: itemIdsOf(player),
    participants: match.info.participants.map((participant) =>
      summarizeParticipant(participant, puuid),
    ),
  };
}

function summarizeParticipant(
  participant: RiotParticipant,
  puuid: string,
): MatchParticipant {
  return {
    participantId: participant.participantId,
    // The PUUID stays on the server: the site only needs the Riot ID to link to the player.
    riotId: riotIdOf(participant),
    championId: participant.championId,
    championName: participant.championName,
    teamId: participant.teamId,
    subteamId: subteamOf(participant),
    isPlayer: participant.puuid === puuid,
  };
}
