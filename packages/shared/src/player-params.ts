import { z } from 'zod';

import { regionSchema } from './region.ts';
import { gameNameSchema, tagLineSchema } from './riot-id.ts';

/**
 * The parts of a URL that identify a player: `/:region/:name/:tag`, both in the API
 * (/api/v1/players/euw/Hide%20on%20bush/KR1) and in the web app (/players/euw/...).
 */
export const playerParamsSchema = z.object({
  region: regionSchema,
  name: gameNameSchema,
  tag: tagLineSchema,
});

export type PlayerParams = z.output<typeof playerParamsSchema>;
