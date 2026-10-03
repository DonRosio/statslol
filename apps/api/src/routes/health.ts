import type { FastifyPluginCallback } from 'fastify';

/** Liveness check: answers as soon as the server accepts requests (for Docker and monitoring). */
export const healthRoutes: FastifyPluginCallback = (app, _options, done) => {
  app.get('/health', () => ({ status: 'ok' }));
  done();
};
