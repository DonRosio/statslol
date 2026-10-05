import { useOutletContext } from 'react-router';

import { MatchHistory } from '../components/MatchHistory.tsx';
import type { ProfileContext } from './ProfileOverview.tsx';

/** The "Arena" tab: the Arena games of the player, which the overview leaves out. */
export function ProfileArena() {
  const { player } = useOutletContext<ProfileContext>();
  return <MatchHistory player={player} mode="arena" />;
}
