import type { Platform, RiotClient, RiotMatch } from '@statslol/riot-client';
import {
  MATCHES_PER_PAGE,
  type MatchHistory,
  type MatchParticipant,
  type MatchSummary,
  type Region,
} from '@statslol/shared';
import type { FastifyBaseLogger } from 'fastify';

import type { MatchStore } from '../db/matches.ts';
import { createSingleFlight } from '../single-flight.ts';
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
 * Builds match histories. Riot gives the list of a player's match IDs; each match is
 * fetched from Riot once, then read from the database.
 */
export function createMatchHistoryService({
  riot,
  store,
  keyGeneration,
  log,
}: {
  readonly riot: RiotClient;
  readonly store: MatchStore;
  readonly keyGeneration: number;
  readonly log: FastifyBaseLogger;
}): MatchHistoryService {
  // Friends who played together look at the same matches: each one is fetched only once,
  // even when several pages ask for it at the same time.
  const singleFlight = createSingleFlight();

  function fetchMatch(
    platform: Platform,
    id: string,
  ): Promise<RiotMatch | null> {
    return singleFlight.run(id, async () => {
      const match = await riot.getMatch(platform, id);
      if (match !== null) await store.save(match, keyGeneration);
      return match;
    });
  }

  return {
    async getPage({ region, gameName, tagLine, start }) {
      const account = await riot.getAccountByRiotId({ gameName, tagLine });
      if (account === null) return null;

      const platform = PLATFORM_BY_REGION[region];
      const ids = await riot.getMatchIdsByPuuid(platform, account.puuid, {
        start,
        count: MATCHES_PER_PAGE,
      });
      const stored = await store.findMany(ids, keyGeneration);
      // The missing matches are fetched at the same time: the Riot client spaces the calls
      // out to respect the rate limits.
      const games = await Promise.all(
        ids.map((id) => {
          const match = stored.get(id);
          return match === undefined
            ? fetchMatch(platform, id)
            : Promise.resolve(match);
        }),
      );

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
    durationSeconds: durationSeconds(match.info),
    result: player.gameEndedInEarlySurrender
      ? 'remake'
      : player.win
        ? 'win'
        : 'loss',
    placement:
      player.placement === undefined || player.placement === 0
        ? null
        : player.placement,
    championId: player.championId,
    championName: player.championName,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    creepScore: player.totalMinionsKilled + player.neutralMinionsKilled,
    position: player.teamPosition === '' ? null : player.teamPosition,
    spellIds: [player.summoner1Id, player.summoner2Id].filter(isSet),
    runes: runesOf(player),
    itemIds: [
      player.item0,
      player.item1,
      player.item2,
      player.item3,
      player.item4,
      player.item5,
      player.item6,
    ].map((id) => id ?? 0),
    participants: match.info.participants.map((participant) =>
      summarizeParticipant(participant, puuid),
    ),
  };
}

type RiotParticipant = RiotMatch['info']['participants'][number];

/** An ID that points to something: Riot uses 0 (or leaves it out) for "none". */
function isSet(id: number | undefined): id is number {
  return id !== undefined && id > 0;
}

/**
 * The keystone and the secondary tree of a player, or null if they had no runes (Arena, or
 * a match that does not tell them). Riot lists the primary tree first, then the secondary.
 */
function runesOf(player: RiotParticipant): MatchSummary['runes'] {
  const [primary, secondary] = player.perks?.styles ?? [];
  const keystoneId = primary?.selections[0]?.perk;
  const secondaryStyleId = secondary?.style;
  return isSet(keystoneId) && isSet(secondaryStyleId)
    ? { keystoneId, secondaryStyleId }
    : null;
}

function summarizeParticipant(
  participant: RiotParticipant,
  puuid: string,
): MatchParticipant {
  const { riotIdGameName, riotIdTagline } = participant;
  return {
    // The PUUID stays on the server: the site only needs the Riot ID to link to the player.
    riotId:
      riotIdGameName === undefined ||
      riotIdTagline === undefined ||
      riotIdGameName === ''
        ? null
        : { gameName: riotIdGameName, tagLine: riotIdTagline },
    championId: participant.championId,
    championName: participant.championName,
    teamId: participant.teamId,
    subteamId: isSet(participant.playerSubteamId)
      ? participant.playerSubteamId
      : null,
    isPlayer: participant.puuid === puuid,
  };
}

/**
 * Riot's advice for gameDuration: in milliseconds when there is no gameEndTimestamp
 * (matches before patch 11.20, in 2021), in seconds otherwise.
 */
function durationSeconds(info: RiotMatch['info']): number {
  return info.gameEndTimestamp === undefined
    ? Math.round(info.gameDuration / 1000)
    : info.gameDuration;
}
