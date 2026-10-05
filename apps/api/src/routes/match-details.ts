import { matchDetailsSchema, matchParamsSchema } from '@statslol/shared';
import type { FastifyPluginCallback } from 'fastify';

import { HttpError } from '../errors.ts';
import { buildMatchDetails } from '../services/match-details.ts';
import type { MatchLoader } from '../services/match-loader.ts';
import { platformOfMatch } from './match-platform.ts';
import type { ZodTypeProvider } from '../zod.ts';

export interface MatchDetailsRoutesOptions {
  readonly matches: MatchLoader;
}

export const matchDetailsRoutes: FastifyPluginCallback<
  MatchDetailsRoutesOptions
> = (app, { matches }, done) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/matches/:region/:matchId',
    {
      schema: {
        params: matchParamsSchema,
        response: { 200: matchDetailsSchema },
      },
      // A match of a profile is in the database already: only a match opened by its URL,
      // never seen here, costs a call to Riot.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request) => {
      const { matchId } = request.params;
      const platform = platformOfMatch(request.params);
      const [match] = await matches.getMany(platform, [matchId]);
      if (match === undefined || match === null) {
        throw new HttpError(404, 'No match with this ID');
      }
      return buildMatchDetails(match);
    },
  );
  done();
};
