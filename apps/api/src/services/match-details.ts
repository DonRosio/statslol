import type { RiotMatch } from '@statslol/riot-client';
import type {
  MatchDetails,
  MatchObjectives,
  MatchPlayer,
  MatchTeam,
} from '@statslol/shared';

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

/**
 * Every team of a finished game with all its players: the 2 sides of the map, or in Arena
 * the teams of players, the best place first.
 */
export function buildMatchDetails(match: RiotMatch): MatchDetails {
  const { info } = match;
  // In Arena, players are grouped by team of players, not by side of the map.
  const arena = info.participants.some((player) => subteamOf(player) !== null);
  const groups = new Map<number, RiotParticipant[]>();
  for (const player of info.participants) {
    const id = arena ? (subteamOf(player) ?? 0) : player.teamId;
    groups.set(id, [...(groups.get(id) ?? []), player]);
  }

  const teams = [...groups].map(([id, players]) =>
    buildTeam(id, players, arena ? null : objectivesOf(info, id)),
  );
  return {
    id: match.metadata.matchId,
    queueId: info.queueId,
    startedAt: new Date(info.gameStartTimestamp).toISOString(),
    durationSeconds: durationSecondsOf(info),
    teams: teams.toSorted(
      (a, b) =>
        // Arena: the best place first. Otherwise: blue side, then red side.
        (a.placement ?? Infinity) - (b.placement ?? Infinity) || a.id - b.id,
    ),
  };
}

function buildTeam(
  id: number,
  players: readonly RiotParticipant[],
  objectives: MatchObjectives | null,
): MatchTeam {
  // The players of a team share their result and their place: the first one tells.
  const [first] = players;
  return {
    id,
    result: first === undefined ? 'loss' : resultOf(first),
    placement: first === undefined ? null : placementOf(first),
    kills: players.reduce((total, player) => total + player.kills, 0),
    gold: players.reduce(
      (total, player) => total + (player.goldEarned ?? 0),
      0,
    ),
    objectives,
    players: players.map(buildPlayer),
  };
}

function buildPlayer(player: RiotParticipant): MatchPlayer {
  return {
    participantId: player.participantId,
    riotId: riotIdOf(player),
    championId: player.championId,
    championName: player.championName,
    level: player.champLevel ?? 0,
    position: positionOf(player),
    spellIds: spellIdsOf(player),
    runes: runesOf(player),
    itemIds: itemIdsOf(player),
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    creepScore: player.totalMinionsKilled + player.neutralMinionsKilled,
    damageToChampions: player.totalDamageDealtToChampions ?? 0,
    gold: player.goldEarned ?? 0,
    visionScore: player.visionScore ?? 0,
  };
}

/** What a side took on the map, or null if the match does not tell (the oldest ones). */
function objectivesOf(
  info: RiotMatch['info'],
  teamId: number,
): MatchObjectives | null {
  const objectives = info.teams?.find(
    (team) => team.teamId === teamId,
  )?.objectives;
  if (objectives === undefined) return null;
  return {
    towers: objectives.tower?.kills ?? 0,
    inhibitors: objectives.inhibitor?.kills ?? 0,
    dragons: objectives.dragon?.kills ?? 0,
    barons: objectives.baron?.kills ?? 0,
    heralds: objectives.riftHerald?.kills ?? 0,
  };
}
