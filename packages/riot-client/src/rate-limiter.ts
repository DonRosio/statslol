import { setTimeout as sleep } from 'node:timers/promises';

import { RiotApiError } from './errors.ts';

/** At most `count` requests in any period of `windowMs` milliseconds. */
export interface RateLimit {
  readonly count: number;
  readonly windowMs: number;
}

/** Source of time: the real one, or a fake one in the tests. */
export interface Clock {
  /** Milliseconds since an arbitrary origin, never going backwards. */
  now(): number;
  sleep(ms: number): Promise<void>;
}

const systemClock: Clock = {
  // Unlike Date.now(), performance.now() cannot jump when the system clock is adjusted.
  now: () => performance.now(),
  sleep: (ms) => sleep(ms),
};

export interface RateLimiterOptions {
  /** Longest wait for a free slot: a request that would wait longer is refused at once. */
  readonly maxWaitMs: number;
  readonly clock?: Clock;
}

// Limits of a development (or personal) key, used until Riot's headers give the real ones.
const DEFAULT_APP_LIMITS: readonly RateLimit[] = [
  { count: 20, windowMs: 1000 },
  { count: 100, windowMs: 120_000 },
];

// Riot counts a request when it receives it, and the network delay varies from one request
// to another: each window is a bit longer than Riot's, so that a request sent just after
// one of our windows ends cannot reach Riot inside its window.
const WINDOW_MARGIN_MS = 500;

// How long to stop after a 429 that gives no Retry-After (Riot gives none for its "service"
// limits, which protect its servers rather than count our requests).
const DEFAULT_BLOCK_MS = 1000;

/** Riot gives the number of seconds to wait. */
export function parseRetryAfterSeconds(
  value: string | null,
): number | undefined {
  return value !== null && /^\d+$/.test(value) ? Number(value) : undefined;
}

/** Parses Riot's "20:1,100:120": 20 requests per second and 100 per 120 seconds. */
function parseLimits(header: string | null): RateLimit[] | undefined {
  if (header === null) return undefined;
  const limits: RateLimit[] = [];
  for (const part of header.split(',')) {
    const match = /^\s*(\d+):(\d+)\s*$/.exec(part);
    if (match === null) return undefined;
    limits.push({ count: Number(match[1]), windowMs: Number(match[2]) * 1000 });
  }
  return limits;
}

/**
 * The requests counted against one set of limits: all the requests to a routing value
 * (Riot's "application" limits), or the ones to a single endpoint (its "method" limits).
 *
 * It is a sliding window: a request may start only if, over each limit's window, fewer
 * requests than the limit have started. A token bucket would not do: it refills
 * continuously, so after a burst of 100 requests it would allow a few more within
 * seconds, while Riot allows no more than 100 in the whole 2-minute window.
 */
class Bucket {
  #limits: readonly RateLimit[];
  /** Start times of the recent requests, oldest first. */
  readonly #starts: number[] = [];
  #blockedUntil = 0;

  constructor(limits: readonly RateLimit[]) {
    this.#limits = limits;
  }

  /** Earliest time a new request can start without exceeding any limit. */
  nextStart(now: number): number {
    let next = Math.max(now, this.#blockedUntil);
    for (const { count, windowMs } of this.#limits) {
      // With `count` requests in the window, the oldest of them must leave it first.
      const oldest = this.#starts[this.#starts.length - count];
      if (oldest !== undefined) {
        next = Math.max(next, oldest + windowMs + WINDOW_MARGIN_MS);
      }
    }
    return next;
  }

  record(time: number, requests = 1): void {
    for (let request = 0; request < requests; request++) {
      this.#starts.push(time);
    }
    // Only the most recent requests can still change a decision.
    const kept = Math.max(0, ...this.#limits.map((limit) => limit.count));
    this.#starts.splice(0, Math.max(0, this.#starts.length - kept));
  }

  blockUntil(time: number): void {
    this.#blockedUntil = Math.max(this.#blockedUntil, time);
  }

  /** Learns from the limits and counts that Riot announces in its headers. */
  learn(limits: string | null, counts: string | null, now: number): void {
    this.#limits = parseLimits(limits) ?? this.#limits;
    // Riot counts every request made with the key, including the ones of other programs
    // (a script, another copy of the API...): when it saw more than we did, the
    // difference is counted as if those requests had just started.
    for (const { count, windowMs } of parseLimits(counts) ?? []) {
      const seen = this.#starts.filter(
        (start) => start > now - windowMs,
      ).length;
      if (count > seen) this.record(now, count - seen);
    }
  }
}

/**
 * Spreads the requests to Riot so that they stay under its rate limits, which are learned
 * from Riot's headers. A request waits for a free slot, or is refused right away (as
 * "rate-limited") when it would wait longer than `maxWaitMs`.
 */
export class RateLimiter {
  readonly #maxWaitMs: number;
  readonly #clock: Clock;
  /** Application limits, per routing value ("euw1", "europe"...). */
  readonly #routes = new Map<string, Bucket>();
  /** Method limits, per routing value and endpoint. */
  readonly #methods = new Map<string, Bucket>();

  constructor({ maxWaitMs, clock = systemClock }: RateLimiterOptions) {
    this.#maxWaitMs = maxWaitMs;
    this.#clock = clock;
  }

  /**
   * Waits until a request to `method` (e.g. "summoner-v4.getByPUUID") on `route` (e.g.
   * "euw1") is allowed by every limit, then counts it. Returns the time it started at.
   */
  async acquire(route: string, method: string): Promise<number> {
    const buckets = this.#bucketsOf(route, method);
    const deadline = this.#clock.now() + this.#maxWaitMs;
    for (;;) {
      const now = this.#clock.now();
      const start = Math.max(...buckets.map((bucket) => bucket.nextStart(now)));
      if (start <= now) {
        for (const bucket of buckets) bucket.record(now);
        return now;
      }
      if (start > deadline) {
        const seconds = Math.ceil((start - now) / 1000);
        throw new RiotApiError(
          'rate-limited',
          `Riot API rate limit reached: next request possible in ${String(seconds)} s`,
          { retryAfterSeconds: seconds },
        );
      }
      // Other requests may take the slot meanwhile: check again after waiting.
      await this.#clock.sleep(start - now);
    }
  }

  /** Learns from Riot's answer: its current limits and counts, and the wait of a 429. */
  update(
    route: string,
    method: string,
    { status, headers }: Pick<Response, 'status' | 'headers'>,
  ): void {
    const now = this.#clock.now();
    const [application, endpoint] = this.#bucketsOf(route, method);
    application.learn(
      headers.get('X-App-Rate-Limit'),
      headers.get('X-App-Rate-Limit-Count'),
      now,
    );
    endpoint.learn(
      headers.get('X-Method-Rate-Limit'),
      headers.get('X-Method-Rate-Limit-Count'),
      now,
    );

    if (status === 429) {
      const seconds = parseRetryAfterSeconds(headers.get('Retry-After'));
      const blockedFor =
        seconds === undefined ? DEFAULT_BLOCK_MS : seconds * 1000;
      // An application limit stops every endpoint; a method or service limit, this one.
      const stopped =
        headers.get('X-Rate-Limit-Type') === 'application'
          ? application
          : endpoint;
      stopped.blockUntil(now + blockedFor);
    }
  }

  #bucketsOf(route: string, method: string): [Bucket, Bucket] {
    return [
      bucketIn(this.#routes, route, DEFAULT_APP_LIMITS),
      // Unknown until Riot's first answer for this endpoint.
      bucketIn(this.#methods, `${route} ${method}`, []),
    ];
  }
}

function bucketIn(
  buckets: Map<string, Bucket>,
  key: string,
  limits: readonly RateLimit[],
): Bucket {
  let bucket = buckets.get(key);
  if (bucket === undefined) {
    bucket = new Bucket(limits);
    buckets.set(key, bucket);
  }
  return bucket;
}
