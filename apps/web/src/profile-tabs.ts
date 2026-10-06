import type { PlayerParams } from '@statslol/shared';

import { playerPath } from './player-path.ts';

/**
 * The tabs of a player's profile page, left to right. Each one is a page of its own: its
 * address is the one of the profile followed by `path` (nothing for the first tab). A tab is
 * added here, and as a child route of the profile (routes.ts), once its content exists: no
 * tab leads to an empty page. Arena has its own tab, after the ones of the usual game (the
 * Mastery tab goes before it).
 */
export const PROFILE_TABS: readonly {
  readonly label: string;
  /** Appended to the address of the profile; empty for the first tab. */
  readonly path: string;
}[] = [
  { label: 'Overview', path: '' },
  { label: 'Champions', path: 'champions' },
  { label: 'Arena', path: 'arena' },
];

/** Address of a tab of a player's profile, e.g. /players/kr/Hide%20on%20bush/KR1/champions. */
export function profileTabPath(
  player: PlayerParams,
  tab: (typeof PROFILE_TABS)[number],
): string {
  const profile = playerPath(player);
  return tab.path === '' ? profile : `${profile}/${tab.path}`;
}
