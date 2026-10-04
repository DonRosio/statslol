import { staticDataSchema, type StaticData } from '@statslol/shared';
import { queryOptions, useQuery } from '@tanstack/react-query';

import { getJson } from './client.ts';

/** GET /api/v1/static-data: version of Data Dragon's files, and the champions. */
export const staticDataQuery = queryOptions({
  queryKey: ['static-data'],
  queryFn: ({ signal }) =>
    getJson('/api/v1/static-data', staticDataSchema, signal),
  // A new version of the game comes out every two weeks, and the API checks every hour.
  staleTime: 60 * 60 * 1000,
});

/**
 * Data Dragon's version and champions, or undefined while they load or when the API cannot
 * give them: the pages then show names instead of images, but stay usable.
 */
export function useStaticData(): StaticData | undefined {
  return useQuery(staticDataQuery).data;
}
