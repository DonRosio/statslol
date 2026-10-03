import { staticDataSchema, type StaticData } from '@statslol/shared';

import type { Cache, CachePolicy } from '../cache/cache.ts';
import type { DataDragonClient } from '../data-dragon.ts';

// A new version comes with each patch, every two weeks: the site shows it within the hour.
const STATIC_DATA_TTL = 60 * 60;

const staticDataPolicy: CachePolicy<StaticData> = {
  name: 'static data',
  schema: staticDataSchema,
  ttlSeconds: () => STATIC_DATA_TTL,
};

/** What the site needs from Data Dragon: asked to Data Dragon at most once an hour. */
export function getStaticData(
  cache: Cache,
  dataDragon: DataDragonClient,
): Promise<StaticData> {
  return cache.getOrLoad('ddragon:static-data:en_US', staticDataPolicy, () =>
    dataDragon.getStaticData(),
  );
}
