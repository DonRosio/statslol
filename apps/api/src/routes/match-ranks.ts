import { matchParamsSchema, matchRanksSchema } from '@statslol/shared';
import type { FastifyPluginCallback } from 'fastify';

import { HttpError } from '../errors.ts';
import type { MatchRanksService } from '../services/match-ranks.ts';
import type { ZodTypeProvider } from '../zod.ts';
import { platformOfMatch } from './match-platform.ts';

export interface MatchRanksRoutesOptions {
  readonly ranks: MatchRanksService;
}

export const matchRanksRoutes: FastifyPluginCallback<
  MatchRanksRoutesOptions
> = (app, { ranks }, done) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/matches/:region/:matchId/ranks',
    {
      schema: {
        params: matchParamsSchema,
        response: { 200: matchRanksSchema },
      },
      // Up to 10 calls to Riot (one for each player) unless their ranks are in the cache.
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request) => {
      platformOfMatch(request.params);
      const result = await ranks.getRanks(request.params);
      if (result === null) throw new HttpError(404, 'No match with this ID');
      return result;
    },
  );
  done();
};
