import type { RiotMatch } from '@statslol/riot-client';
import {
  ITEM_SLOTS,
  type MatchResult,
  type MatchSummary,
} from '@statslol/shared';

/** A player of a match, as Riot sends it. */
export type RiotParticipant = RiotMatch['info']['participants'][number];

/** An ID that points to something: Riot uses 0 (or leaves it out) for "none". */
export function isSet(id: number | undefined): id is number {
  return id !== undefined && id > 0;
}

/** How the game ended for a player. A "remake" was abandoned in its first minutes. */
export function resultOf(player: RiotParticipant): MatchResult {
  if (player.gameEndedInEarlySurrender) return 'remake';
  return player.win ? 'win' : 'loss';
}

/** Place of the player's team in Arena (1 to 6); null in the other modes, and before Arena. */
export function placementOf(player: RiotParticipant): number | null {
  return player.placement === undefined || player.placement === 0
    ? null
    : player.placement;
}

/** TOP, JUNGLE, MIDDLE, BOTTOM or UTILITY; null in modes without positions. */
export function positionOf(player: RiotParticipant): string | null {
  return player.teamPosition === '' ? null : player.teamPosition;
}

/** The 2 summoner spells; none in a mode without them. */
export function spellIdsOf(player: RiotParticipant): number[] {
  return [player.summoner1Id, player.summoner2Id].filter(isSet);
}

/**
 * The keystone and the secondary tree of a player, or null if they had no runes (Arena, or
 * a match that does not tell them). Riot lists the primary tree first, then the secondary.
 */
export function runesOf(player: RiotParticipant): MatchSummary['runes'] {
  const [primary, secondary] = player.perks?.styles ?? [];
  const keystoneId = primary?.selections[0]?.perk;
  const secondaryStyleId = secondary?.style;
  return isSet(keystoneId) && isSet(secondaryStyleId)
    ? { keystoneId, secondaryStyleId }
    : null;
}

/** The 6 slots of the inventory, then the trinket; 0 for an empty slot. */
export function itemIdsOf(player: RiotParticipant): number[] {
  const items = [
    player.item0,
    player.item1,
    player.item2,
    player.item3,
    player.item4,
    player.item5,
    player.item6,
  ].map((id) => id ?? 0);
  // Seven fields: ITEM_SLOTS is the length the schema of the API's answer asks for.
  return items.slice(0, ITEM_SLOTS);
}

/** The Riot ID at the time of the match, or null when Riot does not name the player. */
export function riotIdOf(
  player: RiotParticipant,
): { gameName: string; tagLine: string } | null {
  const { riotIdGameName, riotIdTagline } = player;
  return riotIdGameName === undefined ||
    riotIdTagline === undefined ||
    riotIdGameName === ''
    ? null
    : { gameName: riotIdGameName, tagLine: riotIdTagline };
}

/** The team of a player in Arena (1 to 6), null in the other modes. */
export function subteamOf(player: RiotParticipant): number | null {
  return isSet(player.playerSubteamId) ? player.playerSubteamId : null;
}

/**
 * Riot's advice for gameDuration: in milliseconds when there is no gameEndTimestamp
 * (matches before patch 11.20, in 2021), in seconds otherwise.
 */
export function durationSecondsOf(info: RiotMatch['info']): number {
  return info.gameEndTimestamp === undefined
    ? Math.round(info.gameDuration / 1000)
    : info.gameDuration;
}
