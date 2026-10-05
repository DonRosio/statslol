import type { PlayerParams } from '@statslol/shared';
import { NavLink } from 'react-router';

import { PROFILE_TABS, profileTabPath } from '../profile-tabs.ts';
import styles from './ProfileTabs.module.css';

/**
 * The tabs of a profile, under its header. Each tab is a link to a page of its own, so that
 * a tab can be shared and survives a reload; the one of the page that is open is marked
 * (`aria-current="page"`, set by the router).
 */
export function ProfileTabs({ player }: { player: PlayerParams }) {
  return (
    <nav aria-label="Profile sections" className={styles.tabs}>
      {PROFILE_TABS.map((tab) => (
        <NavLink
          key={tab.label}
          to={profileTabPath(player, tab)}
          // The first tab is the profile itself: it is not "open" on the pages below it.
          end={tab.path === ''}
          className={styles.tab ?? ''}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
