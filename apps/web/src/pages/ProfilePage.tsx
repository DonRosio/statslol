import { formatRiotId, playerParamsSchema } from '@statslol/shared';
import { useParams } from 'react-router';

import { REGION_NAMES } from '../regions.ts';
import { NotFoundPage } from './NotFoundPage.tsx';

/** A player's profile. For now only who it is about: the data comes in the next step. */
export function ProfilePage() {
  // The URL can be typed or edited by hand: same checks as the API before using it.
  const params = playerParamsSchema.safeParse(useParams());
  if (!params.success) {
    return <NotFoundPage />;
  }
  const { region, name, tag } = params.data;
  return (
    <>
      <h1>{formatRiotId({ gameName: name, tagLine: tag })}</h1>
      <p>{REGION_NAMES[region]}</p>
    </>
  );
}
