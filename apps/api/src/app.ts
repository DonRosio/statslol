import { fastifyHelmet } from '@fastify/helmet';
import { fastifyRateLimit } from '@fastify/rate-limit';
import { createRiotClient, type RiotClient } from '@statslol/riot-client';
import { fastify, type FastifyInstance } from 'fastify';

import { createCache, type CacheStore } from './cache/cache.ts';
import { createRedisStore, type RedisConnection } from './cache/redis-store.ts';
import { cachedRiotClient } from './cache/riot-client.ts';
import type { Config } from './config.ts';
import {
  createDataDragonClient,
  type DataDragonClient,
} from './data-dragon.ts';
import type { DatabaseConnection } from './db/connection.ts';
import { createDatabase } from './db/database.ts';
import { createMatchStore, type MatchStore } from './db/matches.ts';
import { errorHandler } from './errors.ts';
import {
  countRiotCalls,
  recordRiotCall,
  RiotCallsLogController,
} from './riot-calls.ts';
import { healthRoutes } from './routes/health.ts';
import { matchDetailsRoutes } from './routes/match-details.ts';
import { matchRanksRoutes } from './routes/match-ranks.ts';
import { playerRoutes } from './routes/players.ts';
import { staticDataRoutes } from './routes/static-data.ts';
import { createChampionStatsService } from './services/champion-stats.ts';
import { createMasteryService } from './services/mastery.ts';
import { createMatchHistoryService } from './services/match-history.ts';
import { createMatchLoader } from './services/match-loader.ts';
import { createSeasonSyncService } from './services/season-sync.ts';
import { createMatchRanksService } from './services/match-ranks.ts';
import { zodSerializerCompiler, zodValidatorCompiler } from './zod.ts';

// Methods that only read: other websites may make browsers send them (links, images...).
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface AppOptions {
  /** Where log lines (one JSON object per line) are written. Defaults to stdout. */
  readonly logStream?: { write(line: string): void };
  /** Client of the Riot API. Defaults to the real one; the tests pass a fake. */
  readonly riot?: RiotClient;
  /** Where the cache keeps its values. Defaults to Redis; the tests pass a MemoryStore. */
  readonly cacheStore?: CacheStore;
  /** Where matches are stored. Defaults to PostgreSQL; the tests pass a MemoryMatchStore. */
  readonly matchStore?: MatchStore;
  /** Client of Data Dragon, Riot's CDN. Defaults to the real one; the tests pass a fake. */
  readonly dataDragon?: DataDragonClient;
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
    // Behind Caddy, every connection comes from Caddy: the address of the client, which the
    // limits per address count, is the one Caddy gives in X-Forwarded-For.
    trustProxy: config.trustProxy,
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

  // Cross-site request forgery: a page of another website must not make the browser of our
  // visitors send requests that change something here (e.g. updating a player). Browsers
  // tell where a request comes from (Fetch Metadata): only this site itself, or the visitor
  // (typed URL, bookmark), may send them. Other clients (curl...) send no such header.
  app.addHook('onRequest', (request, reply, done) => {
    const site = request.headers['sec-fetch-site'];
    if (
      SAFE_METHODS.has(request.method) ||
      site === undefined ||
      site === 'same-origin' ||
      site === 'none'
    ) {
      done();
      return;
    }
    reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Requests from other websites are not allowed',
    });
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
  const cachedRiot = cachedRiotClient(riot, cache, {
    keyGeneration: config.riotKeyGeneration,
  });
  const matchStore =
    options.matchStore ?? connectDatabase(app, config.database);
  const matches = createMatchLoader({
    riot: cachedRiot,
    store: matchStore,
    keyGeneration: config.riotKeyGeneration,
  });
  const matchHistory = createMatchHistoryService({
    riot: cachedRiot,
    matches,
    log: app.log,
  });

  app.register(healthRoutes, { prefix: '/api' });
  app.register(playerRoutes, {
    prefix: '/api/v1',
    riot: cachedRiot,
    matchHistory,
    championStats: createChampionStatsService({
      riot: cachedRiot,
      store: matchStore,
      keyGeneration: config.riotKeyGeneration,
    }),
    mastery: createMasteryService({ riot: cachedRiot }),
    seasonSync: createSeasonSyncService({
      riot: cachedRiot,
      matches,
      store: matchStore,
      keyGeneration: config.riotKeyGeneration,
      paceMs: config.seasonSyncPaceMs,
      log: app.log,
    }),
    cache,
  });
  app.register(matchDetailsRoutes, { prefix: '/api/v1', matches });
  app.register(matchRanksRoutes, {
    prefix: '/api/v1',
    ranks: createMatchRanksService({ matches, riot: cachedRiot, log: app.log }),
  });
  app.register(staticDataRoutes, {
    prefix: '/api/v1',
    cache,
    dataDragon: options.dataDragon ?? createDataDragonClient(),
  });

  return app;
}

/** Opens connections to PostgreSQL when needed, and closes them when the app closes. */
function connectDatabase(app: FastifyInstance, connection: DatabaseConnection) {
  const { db, close } = createDatabase(connection, app.log);
  app.addHook('onClose', close);
  return createMatchStore(db);
}

/** Connects to Redis in the background, and disconnects when the app closes. */
function connectRedis(app: FastifyInstance, connection: RedisConnection) {
  const store = createRedisStore(connection, app.log);
  app.addHook('onClose', () => store.close());
  return store;
}
