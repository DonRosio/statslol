import { RiotApiError, type RiotLeagueEntry } from '@statslol/riot-client';
import { divisionSchema, tierSchema, type Rank } from '@statslol/shared';

const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

/** The rank of a player in one ranked queue, or null if they have none there. */
export function findRank(
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

/** The ranked solo/duo queue: the rank players mean when they talk about "their rank". */
export const SOLO_QUEUE = 'RANKED_SOLO_5x5';
export const FLEX_QUEUE = 'RANKED_FLEX_SR';

/** Ranked Flex 5v5 (Summoner's Rift), the one queue other than solo/duo whose rank is shown. */
const FLEX_QUEUE_ID = 440;

/**
 * The ranked queue whose rank is shown for the players of a game: the one of the game in
 * Ranked Flex, the solo/duo rank for every other (Ranked Solo/Duo, Normal, ARAM...).
 */
export function rankQueueOf(queueId: number): string {
  return queueId === FLEX_QUEUE_ID ? FLEX_QUEUE : SOLO_QUEUE;
}
