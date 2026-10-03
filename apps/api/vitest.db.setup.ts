// Runs before the tests that need the services of compose.yaml (`pnpm test:db`). Locally,
// their passwords come from .env, as for `pnpm dev`. Variables already set in the environment
// (e.g. by the CI) take precedence.
import { existsSync } from 'node:fs';

const envFile = new URL('../../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
