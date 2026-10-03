import { describe, expect, it } from 'vitest';

import { RiotApiError } from './errors.ts';
import { RateLimiter, type Clock } from './rate-limiter.ts';

/** A clock whose waits end at once: two minutes of requests are simulated in milliseconds. */
class FakeClock implements Clock {
  time = 0;

  now(): number {
    return this.time;
  }

  sleep(ms: number): Promise<void> {
    const wakeUp = this.time + ms;
    // Time jumps to the end of the wait (of the latest one, when several overlap).
    return Promise.resolve().then(() => {
      this.time = Math.max(this.time, wakeUp);
    });
  }
}

const SUMMONER = 'summoner-v4.getByPUUID';
const LEAGUE = 'league-v4.getLeagueEntriesByPUUID';

function setUp(maxWaitMs = Number.POSITIVE_INFINITY) {
  const clock = new FakeClock();
  const limiter = new RateLimiter({ maxWaitMs, clock });

  /** Sends `count` requests one after the other and returns their start times. */
  async function send(count: number, route = 'euw1', method = SUMMONER) {
    const starts: number[] = [];
    for (let request = 0; request < count; request++) {
      starts.push(await limiter.acquire(route, method));
    }
    return starts;
  }

  /** Feeds the limiter an answer from Riot with these headers. */
  function answer(
    headers: Record<string, string>,
    { status = 200, route = 'euw1', method = SUMMONER } = {},
  ) {
    limiter.update(route, method, { status, headers: new Headers(headers) });
  }

  return { clock, limiter, send, answer };
}

/** Largest number of requests started within any period of `windowMs`. */
function busiestWindow(starts: readonly number[], windowMs: number): number {
  return Math.max(
    ...starts.map(
      (start) =>
        starts.filter((other) => other >= start && other < start + windowMs)
          .length,
    ),
  );
}

describe('RateLimiter', () => {
  it('lets the first 20 requests start at once', async () => {
    const { send } = setUp();

    expect(new Set(await send(20))).toEqual(new Set([0]));
  });

  it('makes the 21st request wait for the end of the 1-second window', async () => {
    const { send } = setUp();

    const starts = await send(21);

    // 1 second, plus the margin for network delays.
    expect(starts[20]).toBe(1500);
  });

  it('never sends more than 20 requests per second nor 100 per 2 minutes', async () => {
    const { send } = setUp();

    const starts = await send(150);

    expect(busiestWindow(starts, 1000)).toBeLessThanOrEqual(20);
    expect(busiestWindow(starts, 120_000)).toBeLessThanOrEqual(100);
    // The 101st request waits for the first one to leave the 2-minute window.
    expect(starts[100]).toBe(120_500);
  });

  it('keeps those limits when many requests arrive at the same time', async () => {
    const { limiter } = setUp();

    const starts = await Promise.all(
      Array.from({ length: 150 }, () => limiter.acquire('euw1', SUMMONER)),
    );

    expect(busiestWindow(starts, 1000)).toBeLessThanOrEqual(20);
    expect(busiestWindow(starts, 120_000)).toBeLessThanOrEqual(100);
  });

  it('applies the limits that Riot announces', async () => {
    const { send, answer } = setUp();
    answer({ 'X-App-Rate-Limit': '3:10' });

    const starts = await send(4);

    expect(starts).toEqual([0, 0, 0, 10_500]);
  });

  it('keeps the limits of each endpoint apart', async () => {
    const { send, answer } = setUp();
    answer({ 'X-Method-Rate-Limit': '1:60' }, { method: SUMMONER });

    expect(await send(2, 'euw1', SUMMONER)).toEqual([0, 60_500]);
    expect(await send(1, 'euw1', LEAGUE)).toEqual([60_500]);
  });

  it('keeps the limits of each routing value apart', async () => {
    const { send } = setUp();
    await send(20, 'euw1');

    expect(await send(1, 'kr')).toEqual([0]);
  });

  it('counts the requests made by other programs with the same key', async () => {
    const { send, answer } = setUp();
    await send(1);
    // Riot saw 96 requests in the last 2 minutes: 95 were not ours.
    answer({ 'X-App-Rate-Limit-Count': '96:120' });

    const starts = await send(5);

    // 4 more fit in the 2-minute window (after the 1-second one), the 5th must wait.
    expect(starts).toEqual([1500, 1500, 1500, 1500, 120_500]);
  });

  it('stops every endpoint of the routing value after an application 429', async () => {
    const { send, answer } = setUp();
    answer(
      { 'Retry-After': '7', 'X-Rate-Limit-Type': 'application' },
      { status: 429 },
    );

    expect(await send(1, 'euw1', LEAGUE)).toEqual([7000]);
  });

  it('stops only the endpoint after a method 429', async () => {
    const { send, answer } = setUp();
    answer(
      { 'Retry-After': '7', 'X-Rate-Limit-Type': 'method' },
      { status: 429, method: SUMMONER },
    );

    expect(await send(1, 'euw1', LEAGUE)).toEqual([0]);
    expect(await send(1, 'euw1', SUMMONER)).toEqual([7000]);
  });

  it('waits 1 second after a 429 that gives no delay', async () => {
    const { send, answer } = setUp();
    answer({ 'X-Rate-Limit-Type': 'service' }, { status: 429 });

    expect(await send(1)).toEqual([1000]);
  });

  it('refuses at once a request that would wait too long, without counting it', async () => {
    const { clock, limiter, send, answer } = setUp(3000);
    answer({ 'X-App-Rate-Limit': '1:60' });
    await send(1);

    const refused = limiter.acquire('euw1', SUMMONER);

    await expect(refused).rejects.toThrow(RiotApiError);
    await expect(refused).rejects.toMatchObject({
      kind: 'rate-limited',
      retryAfterSeconds: 61,
    });
    expect(clock.now()).toBe(0);
    clock.time = 60_500;
    expect(await send(1)).toEqual([60_500]);
  });
});
