// Sends 150 real requests to Riot, from 5 simulated users at once. A development key
// allows 100 requests per 2 minutes: the rate limiter must spread them out so that Riot
// never answers 429. Takes a bit more than 2 minutes.
//   pnpm --filter @statslol/riot-client check:rate-limits
import { createRiotClient, RiotApiError } from '../src/index.ts';

const REQUESTS = 150;
const USERS = 5;

const apiKey = process.env.RIOT_API_KEY;
if (apiKey === undefined || apiKey === '') {
  console.error(
    'RIOT_API_KEY is missing: copy .env.example to .env and fill it in',
  );
  process.exit(1);
}

// Unlike the API, this script can wait as long as needed for a free slot.
const riot = createRiotClient({ apiKey, maxQueueWaitMs: 10 * 60_000 });

const startedAt = performance.now();
const elapsed = () =>
  `${((performance.now() - startedAt) / 1000).toFixed(1)} s`;
let sent = 0;
let answered = 0;
let refusedByRiot = 0;

async function simulateUser(): Promise<void> {
  while (sent < REQUESTS) {
    sent++;
    try {
      await riot.getAccountByRiotId({
        gameName: 'Hide on bush',
        tagLine: 'KR1',
      });
    } catch (error) {
      // Only a 429 sent by Riot itself means that the limiter let too many requests through.
      if (!(error instanceof RiotApiError && error.status === 429)) throw error;
      refusedByRiot++;
    }
    answered++;
    if (answered % 25 === 0) {
      console.log(
        `${String(answered)} answers after ${elapsed()}, 429: ${String(refusedByRiot)}`,
      );
    }
  }
}

await Promise.all(Array.from({ length: USERS }, simulateUser));
console.log(
  refusedByRiot === 0
    ? `OK: ${String(REQUESTS)} requests in ${elapsed()}, none refused by Riot`
    : `FAILED: Riot refused ${String(refusedByRiot)} requests (429)`,
);
process.exitCode = refusedByRiot === 0 ? 0 : 1;
