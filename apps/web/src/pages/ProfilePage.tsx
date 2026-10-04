import {
  formatRiotId,
  playerParamsSchema,
  type PlayerParams,
} from '@statslol/shared';
import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { useParams } from 'react-router';

import { ApiError } from '../api/client.ts';
import { playerProfileQuery } from '../api/players.ts';
import { ErrorMessage } from '../components/ErrorMessage.tsx';
import { MatchHistory } from '../components/MatchHistory.tsx';
import { ProfileHeader } from '../components/ProfileHeader.tsx';
import { RankCards } from '../components/RankCards.tsx';
import { SearchForm } from '../components/SearchForm.tsx';
import { REGION_NAMES } from '../regions.ts';
import { NotFoundPage } from './NotFoundPage.tsx';
import styles from './ProfilePage.module.css';

/** A player's profile: icon, level, ranks and match history. */
export function ProfilePage() {
  // The URL can be typed or edited by hand: same checks as the API before using it.
  const params = playerParamsSchema.safeParse(useParams());
  if (!params.success) {
    return <NotFoundPage />;
  }
  const { region, name, tag } = params.data;
  return (
    // A new key for each player: going to another profile starts from a blank state (e.g.
    // no countdown of the "Update" button of the previous player).
    <Profile key={`${region}/${name}#${tag}`} player={params.data} />
  );
}

function Profile({ player }: { player: PlayerParams }) {
  // The profile and the matches are asked for at the same time: the matches do not wait.
  const profile = useQuery(playerProfileQuery(player));

  let content;
  if (profile.data === undefined && profile.error !== null) {
    content =
      profile.error instanceof ApiError && profile.error.status === 404 ? (
        <PlayerNotFound player={player} />
      ) : (
        <ErrorMessage
          title="The profile could not be loaded."
          error={profile.error}
          onRetry={() => {
            void profile.refetch();
          }}
          retrying={profile.isFetching}
        />
      );
  } else {
    content = (
      <div className={styles.columns}>
        <div>
          {profile.data === undefined && (
            <p role="status" className="visually-hidden">
              Loading the profile…
            </p>
          )}
          <RankCards ranks={profile.data?.ranks} />
        </div>
        <MatchHistory player={player} />
      </div>
    );
  }

  return (
    <>
      <ProfileHeader player={player} profile={profile.data} />
      {content}
    </>
  );
}

/** No player with this Riot ID on this region: the search form, ready to correct it. */
function PlayerNotFound({ player }: { player: PlayerParams }) {
  const headingId = useId();
  const riotId = formatRiotId({ gameName: player.name, tagLine: player.tag });
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Player not found</h2>
      <p>
        No League of Legends player has the Riot ID <strong>{riotId}</strong> on{' '}
        {REGION_NAMES[player.region]}. Check the name, the tag after the # and
        the region.
      </p>
      <SearchForm initialRiotId={riotId} initialRegion={player.region} />
    </section>
  );
}
