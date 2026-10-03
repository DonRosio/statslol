import type { RiotClient } from '@statslol/riot-client';
import {
  gameNameSchema,
  playerProfileSchema,
  regionSchema,
  tagLineSchema,
} from '@statslol/shared';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';

import { HttpError } from '../errors.ts';
import { getPlayerProfile } from '../services/player-profile.ts';
import type { ZodTypeProvider } from '../zod.ts';

export interface PlayerRoutesOptions {
  readonly riot: RiotClient;
}

const playerParamsSchema = z.object({
  region: regionSchema,
  name: gameNameSchema,
  tag: tagLineSchema,
});

export const playerRoutes: FastifyPluginCallback<PlayerRoutesOptions> = (
  app,
  { riot },
  done,
) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/players/:region/:name/:tag',
    {
      schema: {
        params: playerParamsSchema,
        response: { 200: playerProfileSchema },
      },
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
  done();
};
