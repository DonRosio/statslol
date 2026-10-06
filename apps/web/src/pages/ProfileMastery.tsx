import { useOutletContext } from 'react-router';

import { MasteryBox } from '../components/MasteryBox.tsx';
import type { ProfileContext } from './ProfileOverview.tsx';

/** The "Mastery" tab: the champion mastery of the player, champion by champion. */
export function ProfileMastery() {
  const { player } = useOutletContext<ProfileContext>();
  return <MasteryBox player={player} />;
}
