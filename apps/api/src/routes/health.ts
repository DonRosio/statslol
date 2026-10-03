import { healthSchema } from '@statslol/shared';
import type { FastifyPluginCallback } from 'fastify';

import type { ZodTypeProvider } from '../zod.ts';

/** Liveness check: answers as soon as the server accepts requests (for Docker and monitoring). */
export const healthRoutes: FastifyPluginCallback = (app, _options, done) => {
  // Not rate limited: monitoring must always get an answer.
  app.withTypeProvider<ZodTypeProvider>().get(
    '/health',
    {
      schema: { response: { 200: healthSchema } },
      config: { rateLimit: false },
    },
    () => ({ status: 'ok' as const }),
  );
  done();
};
