import { setTimeout as sleepFor } from 'node:timers/promises';

import {
  RiotApiError,
  type Platform,
  type RiotClient,
} from '@statslol/riot-client';
import {
  seasonById,
  seasonWindow,
  type Region,
  type SeasonId,
  type SeasonSync,
} from '@statslol/shared';
import type { FastifyBaseLogger } from 'fastify';

import type { MatchStore } from '../db/matches.ts';
import type { MatchLoader } from './match-loader.ts';
import { PLATFORM_BY_REGION } from './platforms.ts';

/** Riot gives at most 100 match IDs per call. */
const IDS_PER_CALL = 100;
/** More than this is not a player but a bug: 3000 games in one season. */
const MAX_ID_CALLS = 30;
/** Tries for one call to Riot (the first one included) before giving up on it. */
const MAX_ATTEMPTS = 4;
/** How long after a loading ended a new one can start (which lists the games again). */
const RESTART_AFTER_MS = 2 * 60 * 1000;
/** Pause before trying again after a timeout or a server error of Riot. */
const RETRY_PAUSE_MS = 2000;

export interface SeasonSyncRequest {
  readonly region: Region;
  readonly gameName: string;
  readonly tagLine: string;
  readonly season: SeasonId;
}

export interface SeasonSyncService {
  /**
   * Starts loading all the games a player played in a season, in the background, and answers
   * at once with how it is going. Does nothing if this loading is already queued or running,
   * or ended less than 2 minutes ago. Returns null if no account has this Riot ID.
   */
  start(request: SeasonSyncRequest): Promise<SeasonSync | null>;

  /** How the loading of the season is going; "idle" if it never started since the API did. */
  status(request: SeasonSyncRequest): Promise<SeasonSync | null>;
}

interface Run {
  state: SeasonSync['state'];
  done: number;
  total: number;
  failed: number;
  /** When it ended (ms), once it has. */
  endedAt?: number;
}

/**
 * Loads the games of a season for the Champions tab. The statistics are made of the games
 * stored in the database, and a player's history only loads a few of them: this lists the
 * season's games at Riot (match IDs, 100 per call) and fetches the ones not stored yet, one
 * call each. Nothing waits for it: a visitor starts it, and watches the number of games
 * grow.
 *
 * It must not eat the visitors' share of the Riot key: loadings run one at a time (every
 * player's, in order of arrival), and `paceMs` is paused before each call to Riot. A game
 * is stored as soon as it arrives: a loading that stops (restart, failure) loses nothing,
 * the next one only fetches what is missing.
 */
export function createSeasonSyncService({
  riot,
  matches,
  store,
  keyGeneration,
  paceMs,
  log,
  now = () => Date.now(),
  sleep = (ms) => sleepFor(ms),
}: {
  readonly riot: Pick<RiotClient, 'getAccountByRiotId' | 'getMatchIdsByPuuid'>;
  readonly matches: MatchLoader;
  readonly store: Pick<MatchStore, 'findMany'>;
  readonly keyGeneration: number;
  readonly paceMs: number;
  readonly log: FastifyBaseLogger;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}): SeasonSyncService {
  const runs = new Map<string, Run>();
  // The loadings, one after the other.
  let queue: Promise<void> = Promise.resolve();

  /** One call to Riot, after the pause, tried again when Riot is busy or slow. */
  async function call<T>(send: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      if (paceMs > 0) await sleep(paceMs);
      try {
        return await send();
      } catch (error) {
        if (
          !(error instanceof RiotApiError) ||
          attempt === MAX_ATTEMPTS ||
          !['rate-limited', 'timeout', 'unavailable'].includes(error.kind)
        ) {
          throw error;
        }
        await sleep(
          error.kind === 'rate-limited'
            ? (error.retryAfterSeconds ?? 2) * 1000
            : RETRY_PAUSE_MS,
        );
      }
    }
  }

  /** The IDs of every game of the player in the period, the most recent first. */
  async function listGames(
    platform: Platform,
    puuid: string,
    season: SeasonId,
  ): Promise<string[]> {
    const { fromMs, toMs } = seasonWindow(seasonById(season), new Date(now()));
    const ids: string[] = [];
    for (let calls = 0; calls < MAX_ID_CALLS; calls += 1) {
      const page = await call(() =>
        riot.getMatchIdsByPuuid(platform, puuid, {
          start: ids.length,
          count: IDS_PER_CALL,
          startTime: Math.floor(fromMs / 1000),
          endTime: Math.floor(toMs / 1000),
        }),
      );
      ids.push(...page);
      if (page.length < IDS_PER_CALL) break;
    }
    return ids;
  }

  async function execute(
    run: Run,
    platform: Platform,
    puuid: string,
    season: SeasonId,
  ): Promise<void> {
    run.state = 'running';
    try {
      const ids = await listGames(platform, puuid, season);
      const stored = await store.findMany(ids, keyGeneration);
      run.total = ids.length;
      run.done = stored.size;

      for (const id of ids) {
        if (stored.has(id)) continue;
        try {
          const [match] = await call(() => matches.getMany(platform, [id]));
          // Riot listed the game but does not have it (any more).
          if (match === null || match === undefined) run.failed += 1;
          else run.done += 1;
        } catch (error) {
          // The key no longer works: no game will come.
          if (error instanceof RiotApiError && error.kind === 'unauthorized') {
            throw error;
          }
          log.warn(
            { err: error, matchId: id },
            'A game of a season could not be loaded',
          );
          run.failed += 1;
        }
      }
      run.state = 'done';
    } catch (error) {
      log.error({ err: error }, 'The loading of a season failed');
      run.state = 'failed';
    } finally {
      run.endedAt = now();
    }
  }

  /** The account of the request, and the key of its loading. */
  async function resolve(request: SeasonSyncRequest) {
    const account = await riot.getAccountByRiotId({
      gameName: request.gameName,
      tagLine: request.tagLine,
    });
    if (account === null) return null;
    const platform = PLATFORM_BY_REGION[request.region];
    return {
      platform,
      puuid: account.puuid,
      key: `${platform}:${account.puuid}:${request.season}`,
    };
  }

  return {
    async start(request) {
      const player = await resolve(request);
      if (player === null) return null;

      const current = runs.get(player.key);
      if (
        current !== undefined &&
        (current.endedAt === undefined ||
          now() - current.endedAt < RESTART_AFTER_MS)
      ) {
        return snapshot(current);
      }

      const run: Run = { state: 'queued', done: 0, total: 0, failed: 0 };
      runs.set(player.key, run);
      queue = queue.then(() =>
        execute(run, player.platform, player.puuid, request.season),
      );
      return snapshot(run);
    },

    async status(request) {
      const player = await resolve(request);
      if (player === null) return null;
      const run = runs.get(player.key);
      return run === undefined
        ? { state: 'idle', done: 0, total: 0, failed: 0 }
        : snapshot(run);
    },
  };
}

function snapshot({ state, done, total, failed }: Run): SeasonSync {
  return { state, done, total, failed };
}
