import { matchDetailsSchema, matchParamsSchema } from '@statslol/shared';
import type { FastifyPluginCallback } from 'fastify';

import { HttpError } from '../errors.ts';
import { buildMatchDetails } from '../services/match-details.ts';
import type { MatchLoader } from '../services/match-loader.ts';
import { PLATFORM_BY_REGION } from '../services/platforms.ts';
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
      const { region, matchId } = request.params;
      const platform = PLATFORM_BY_REGION[region];
      // "EUW1_7123456789" is a match of the platform euw1: asking Riot for it on another
      // server would only fail, and cost a call.
      if (!matchId.startsWith(`${platform.toUpperCase()}_`)) {
        throw new HttpError(400, 'This match was not played on this server');
      }
      const [match] = await matches.getMany(platform, [matchId]);
      if (match === undefined || match === null) {
        throw new HttpError(404, 'No match with this ID');
      }
      return buildMatchDetails(match);
    },
  );
  done();
};
