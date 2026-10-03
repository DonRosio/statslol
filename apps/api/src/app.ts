import { fastifyHelmet } from '@fastify/helmet';
import { fastifyRateLimit } from '@fastify/rate-limit';
import { createRiotClient, type RiotClient } from '@statslol/riot-client';
import { fastify, type FastifyInstance } from 'fastify';

import { createCache, type CacheStore } from './cache/cache.ts';
import { createRedisStore, type RedisConnection } from './cache/redis-store.ts';
import { cachedRiotClient } from './cache/riot-client.ts';
import type { Config } from './config.ts';
import { errorHandler } from './errors.ts';
import {
  countRiotCalls,
  recordRiotCall,
  RiotCallsLogController,
} from './riot-calls.ts';
import { healthRoutes } from './routes/health.ts';
import { playerRoutes } from './routes/players.ts';
import { zodSerializerCompiler, zodValidatorCompiler } from './zod.ts';

export interface AppOptions {
  /** Where log lines (one JSON object per line) are written. Defaults to stdout. */
  readonly logStream?: { write(line: string): void };
  /** Client of the Riot API. Defaults to the real one; the tests pass a fake. */
  readonly riot?: RiotClient;
  /** Where the cache keeps its values. Defaults to Redis; the tests pass a MemoryStore. */
  readonly cacheStore?: CacheStore;
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
    // Adds to the log line of each request the number of calls it sent to Riot.
    logController: new RiotCallsLogController(),
  });

  app.setValidatorCompiler(zodValidatorCompiler);
  app.setSerializerCompiler(zodSerializerCompiler);
  app.setErrorHandler(errorHandler);

  // Security headers on every answer, errors included. The API only answers JSON: its
  // Content-Security-Policy forbids loading, running or embedding anything from it.
  app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    frameguard: { action: 'deny' },
  });

  // Limits the requests of each client IP address (for IPv6, of each /64 network, which
  // a single subscriber controls entirely). Every route gets this limit unless it sets its
  // own with `config.rateLimit`, so a new route is never left without one.
  app.register(fastifyRateLimit, {
    global: true,
    max: 60,
    timeWindow: '1 minute',
  });

  countRiotCalls(app);
  // The only place where the API key is revealed: the client sends it to Riot.
  const riot =
    options.riot ??
    createRiotClient({
      apiKey: config.riotApiKey.reveal(),
      onCall: (call) => {
        recordRiotCall(app.log, call);
      },
    });
  const cache = createCache(
    options.cacheStore ?? connectRedis(app, config.redis),
    app.log,
  );

  app.register(healthRoutes, { prefix: '/api' });
  app.register(playerRoutes, {
    prefix: '/api/v1',
    riot: cachedRiotClient(riot, cache),
  });

  return app;
}

/** Connects to Redis in the background, and disconnects when the app closes. */
function connectRedis(app: FastifyInstance, connection: RedisConnection) {
  const store = createRedisStore(connection, app.log);
  app.addHook('onClose', () => store.close());
  return store;
}
