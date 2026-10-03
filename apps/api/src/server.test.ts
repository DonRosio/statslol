// Starts the real entry point in a child process, as `pnpm dev` and Docker do.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, onTestFinished } from 'vitest';

const serverPath = fileURLToPath(new URL('server.ts', import.meta.url));

// Valid format, but cannot be a real key (allowed in .gitleaks.toml).
const FAKE_RIOT_API_KEY = 'RGAPI-00000000-0000-0000-0000-000000000000';

describe('server', () => {
  it('refuses to start with an invalid configuration', () => {
    // Only these variables: the developer's own environment must not change the result.
    const result = spawnSync(process.execPath, [serverPath], {
      env: { PORT: 'abc', RIOT_API_KEY: 'RGAPI-my-secret-value' },
      encoding: 'utf8',
      timeout: 10_000,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PORT');
    expect(result.stderr).toContain('RIOT_API_KEY');
    expect(result.stderr).not.toContain('my-secret-value');
  });

  it('serves requests, then stops cleanly on SIGTERM', async () => {
    const server = spawn(process.execPath, [serverPath], {
      // Redis and PostgreSQL may be unreachable or refuse these passwords: the API still
      // starts (without cache; the match history would answer 500 until the database is up).
      env: {
        HOST: '127.0.0.1',
        PORT: '0',
        RIOT_API_KEY: FAKE_RIOT_API_KEY,
        REDIS_PASSWORD: 'unused',
        POSTGRES_APP_PASSWORD: 'unused',
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    onTestFinished(() => {
      server.kill('SIGKILL');
    });
    const exited = once(server, 'exit');

    // PORT=0 lets the system pick a free port: read it from the startup log line.
    let url: string | undefined;
    for await (const line of createInterface({ input: server.stdout })) {
      url = /Server listening at (http:\/\/[\d.:]+)/.exec(line)?.[1];
      if (url !== undefined) break;
    }
    if (url === undefined) {
      throw new Error('The server exited before listening');
    }

    const response = await fetch(`${url}/api/health`);
    expect(response.status).toBe(200);

    server.kill('SIGTERM');
    expect(await exited).toEqual([0, null]);
  });
});
