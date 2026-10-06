import { useOutletContext } from 'react-router';

import { ChampionStatsBox } from '../components/ChampionStatsBox.tsx';
import type { ProfileContext } from './ProfileOverview.tsx';

/** The "Champions" tab: what the player did with each champion, from the stored games. */
export function ProfileChampions() {
  const { player } = useOutletContext<ProfileContext>();
  return <ChampionStatsBox player={player} />;
}
