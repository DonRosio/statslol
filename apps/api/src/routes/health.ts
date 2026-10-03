import type { FastifyPluginCallback } from 'fastify';

/** Liveness check: answers as soon as the server accepts requests (for Docker and monitoring). */
export const healthRoutes: FastifyPluginCallback = (app, _options, done) => {
  // Not rate limited: monitoring must always get an answer.
  app.get('/health', { config: { rateLimit: false } }, () => ({
    status: 'ok',
  }));
  done();
};
