import { staticDataSchema } from '@statslol/shared';
import type { FastifyPluginCallback } from 'fastify';

import type { Cache } from '../cache/cache.ts';
import type { DataDragonClient } from '../data-dragon.ts';
import { getStaticData } from '../services/static-data.ts';
import type { ZodTypeProvider } from '../zod.ts';

export interface StaticDataRoutesOptions {
  readonly cache: Cache;
  readonly dataDragon: DataDragonClient;
}

export const staticDataRoutes: FastifyPluginCallback<
  StaticDataRoutesOptions
> = (app, { cache, dataDragon }, done) => {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      '/static-data',
      { schema: { response: { 200: staticDataSchema } } },
      () => getStaticData(cache, dataDragon),
    );
  done();
};
