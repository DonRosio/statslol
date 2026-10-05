import {
  formatRiotId,
  playerParamsSchema,
  type PlayerParams,
} from '@statslol/shared';
import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Outlet, useParams } from 'react-router';

import { ApiError } from '../api/client.ts';
import { playerProfileQuery } from '../api/players.ts';
import { ErrorMessage } from '../components/ErrorMessage.tsx';
import { Panel } from '../components/Panel.tsx';
import { ProfileHeader } from '../components/ProfileHeader.tsx';
import { ProfileTabs } from '../components/ProfileTabs.tsx';
import { SearchForm } from '../components/SearchForm.tsx';
import { REGION_NAMES } from '../regions.ts';
import { NotFoundPage } from './NotFoundPage.tsx';
import type { ProfileContext } from './ProfileOverview.tsx';

/** A player's profile: icon, level and Update button, then the tab that is open. */
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
    content = (
      <Panel>
        {profile.error instanceof ApiError && profile.error.status === 404 ? (
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
        )}
      </Panel>
    );
  } else {
    const context: ProfileContext = { player, profile: profile.data };
    content = (
      <>
        <ProfileTabs player={player} />
        <Panel>
          {/* The tab of the address: what each one shows is in its own page. */}
          <Outlet context={context} />
        </Panel>
      </>
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
