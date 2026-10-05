import type { PlayerParams, PlayerProfile } from '@statslol/shared';
import { useOutletContext } from 'react-router';

import { MatchHistory } from '../components/MatchHistory.tsx';
import { RankCards } from '../components/RankCards.tsx';
import styles from './ProfilePage.module.css';

/** What a profile page gives to the tab that is open (see ProfilePage). */
export interface ProfileContext {
  readonly player: PlayerParams;
  /** Undefined until the API answers. */
  readonly profile: PlayerProfile | undefined;
}

/**
 * The "Overview" tab: the ranks on the left, the summary and the matches on the right. The
 * Arena games are not here: they have their own tab.
 */
export function ProfileOverview() {
  const { player, profile } = useOutletContext<ProfileContext>();
  return (
    <div className={styles.columns}>
      <div>
        {profile === undefined && (
          <p role="status" className="visually-hidden">
            Loading the profile…
          </p>
        )}
        <RankCards ranks={profile?.ranks} />
      </div>
      <MatchHistory player={player} mode="overview" />
    </div>
  );
}
