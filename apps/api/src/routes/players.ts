import {
  matchHistorySchema,
  playerParamsSchema,
  playerProfileSchema,
} from '@statslol/shared';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';

import type { Cache } from '../cache/cache.ts';
import type { CachedRiotClient } from '../cache/riot-client.ts';
import { HttpError } from '../errors.ts';
import type { MatchHistoryService } from '../services/match-history.ts';
import { getPlayerProfile } from '../services/player-profile.ts';
import { refreshPlayer } from '../services/refresh.ts';
import type { ZodTypeProvider } from '../zod.ts';

export interface PlayerRoutesOptions {
  readonly riot: CachedRiotClient;
  readonly matchHistory: MatchHistoryService;
  readonly cache: Cache;
}

const matchHistoryQuerySchema = z.object({
  // Number of matches to skip, from the most recent: the `nextStart` of the previous page.
  start: z.coerce.number().int().min(0).max(1000).default(0),
});

export const playerRoutes: FastifyPluginCallback<PlayerRoutesOptions> = (
  app,
  { riot, matchHistory, cache },
  done,
) => {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/players/:region/:name/:tag',
    {
      schema: {
        params: playerParamsSchema,
        response: { 200: playerProfileSchema },
      },
      // Each lookup costs 3 calls to Riot. 20 per minute lets a player check a whole game
      // lobby in one go, while a script cannot flood the API. Protecting our Riot quota
      // itself is the job of the Riot client's rate limiter and of the cache (steps 2.1, 2.3).
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request) => {
      const { region, name, tag } = request.params;
      const profile = await getPlayerProfile(riot, {
        region,
        gameName: name,
        tagLine: tag,
      });
      if (profile === null) {
        throw new HttpError(404, 'No player with this Riot ID on this region');
      }
      return profile;
    },
  );

  routes.get(
    '/players/:region/:name/:tag/matches',
    {
      schema: {
        params: playerParamsSchema,
        querystring: matchHistoryQuerySchema,
        response: { 200: matchHistorySchema },
      },
      // A page of matches never seen before costs up to 11 calls to Riot.
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request) => {
      const { region, name, tag } = request.params;
      const history = await matchHistory.getPage({
        region,
        gameName: name,
        tagLine: tag,
        start: request.query.start,
      });
      if (history === null) {
        throw new HttpError(404, 'No player with this Riot ID');
      }
      return history;
    },
  );

  routes.post(
    '/players/:region/:name/:tag/refresh',
    {
      schema: { params: playerParamsSchema },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { region, name, tag } = request.params;
      const result = await refreshPlayer(
        { riot, cache },
        { region, gameName: name, tagLine: tag },
      );
      switch (result.outcome) {
        case 'not-found':
          throw new HttpError(404, 'No player with this Riot ID');
        case 'too-soon':
          return reply
            .code(429)
            .header('Retry-After', String(result.retryAfterSeconds))
            .send({
              statusCode: 429,
              error: 'Too Many Requests',
              message: 'This player was updated less than 2 minutes ago',
            });
        case 'refreshed':
          // Nothing to send: the next lookups get fresh data.
          return reply.code(204).send();
      }
    },
  );

  done();
};
