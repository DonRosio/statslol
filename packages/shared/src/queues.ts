/** The modes of Arena: 16 players in teams, ranked by place. They have a tab of their own. */
export const ARENA_QUEUE_IDS: ReadonlySet<number> = new Set([1700, 1710, 1750]);

/**
 * Whether a game is an Arena game: its mode is one of Arena, or it was ranked by place (the
 * modes of Arena that the list above does not know yet give a place all the same).
 */
export function isArenaGame({
  queueId,
  placement,
}: {
  readonly queueId: number;
  readonly placement: number | null;
}): boolean {
  return ARENA_QUEUE_IDS.has(queueId) || placement !== null;
}
