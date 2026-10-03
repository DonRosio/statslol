import { healthSchema } from '@statslol/shared';
import { queryOptions } from '@tanstack/react-query';

import { getJson } from './client.ts';

/** GET /api/health: whether the API is up. */
export const healthQuery = queryOptions({
  queryKey: ['health'],
  queryFn: ({ signal }) => getJson('/api/health', healthSchema, signal),
  // A status indicator shows a failure at once, without retrying first.
  retry: false,
});
