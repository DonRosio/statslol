import { fastify, type FastifyInstance } from 'fastify';

import type { Config } from './config.ts';
import { healthRoutes } from './routes/health.ts';

export interface AppOptions {
  /** Where log lines (one JSON object per line) are written. Defaults to stdout. */
  readonly logStream?: { write(line: string): void };
}

/** Creates the API without starting it: the tests send it requests with `app.inject()`. */
export function buildApp(
  config: Config,
  options: AppOptions = {},
): FastifyInstance {
  const app = fastify({
    logger: {
      level: config.logLevel,
      // Fastify logs the method, URL and status code of requests, never their headers. If headers
      // are ever logged ("headers" or "<anything>.headers"), the ones carrying credentials are
      // masked: Authorization (e.g. basic auth in front of the site), Cookie, and X-Riot-Token
      // (the header that carries our Riot API key on calls to Riot).
      redact: {
        paths: [
          'headers.authorization',
          'headers.cookie',
          'headers["x-riot-token"]',
          '*.headers.authorization',
          '*.headers.cookie',
          '*.headers["x-riot-token"]',
        ],
        censor: '[REDACTED]',
      },
      ...(options.logStream && { stream: options.logStream }),
    },
  });

  app.register(healthRoutes, { prefix: '/api' });

  return app;
}
