import { playerParamsSchema, type PlayerParams } from '@statslol/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';

import { playerProfileQuery } from '../api/players.ts';
import { MatchHistory } from '../components/MatchHistory.tsx';
import { ProfileHeader } from '../components/ProfileHeader.tsx';
import { RankCards } from '../components/RankCards.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

/** A player's profile: icon, level, ranks and match history. */
export function ProfilePage() {
  // The URL can be typed or edited by hand: same checks as the API before using it.
  const params = playerParamsSchema.safeParse(useParams());
  if (!params.success) {
    return <NotFoundPage />;
  }
  return <Profile player={params.data} />;
}

function Profile({ player }: { player: PlayerParams }) {
  // The profile and the matches are asked for at the same time: the matches do not wait.
  const profile = useQuery(playerProfileQuery(player));

  return (
    <>
      <ProfileHeader player={player} profile={profile.data} />
      {profile.data === undefined && profile.isError ? (
        <p role="alert">The profile could not be loaded.</p>
      ) : (
        <>
          {profile.data === undefined ? (
            <p role="status">Loading the profile…</p>
          ) : (
            <RankCards ranks={profile.data.ranks} />
          )}
          <MatchHistory player={player} />
        </>
      )}
    </>
  );
}
