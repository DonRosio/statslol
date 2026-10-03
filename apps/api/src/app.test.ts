import { describe, expect, it, onTestFinished } from 'vitest';

import { buildApp, type AppOptions } from './app.ts';
import type { Config } from './config.ts';
import { Secret } from './secret.ts';

const config: Config = {
  host: 'localhost',
  port: 0,
  logLevel: 'silent',
  riotApiKey: new Secret('RGAPI-test-key'),
};

function createApp(overrides: Partial<Config> = {}, options?: AppOptions) {
  const app = buildApp({ ...config, ...overrides }, options);
  onTestFinished(() => app.close());
  return app;
}

describe('GET /api/health', () => {
  it('answers that the API is up', async () => {
    const response = await createApp().inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('is only served under /api', async () => {
    const response = await createApp().inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('logs', () => {
  it('mask credentials and secrets', () => {
    const lines: string[] = [];
    const app = createApp(
      { logLevel: 'info' },
      { logStream: { write: (line) => lines.push(line) } },
    );

    app.log.info(
      {
        headers: {
          authorization: 'Basic dXNlcjpwYXNz',
          cookie: 'session=abc123',
        },
      },
      'headers logged directly',
    );
    app.log.info(
      { request: { headers: { 'x-riot-token': 'RGAPI-a' } } },
      'headers logged inside another object',
    );
    app.log.info({ config }, 'configuration loaded');

    const output = lines.join('');
    expect(output).not.toContain('dXNlcjpwYXNz');
    expect(output).not.toContain('session=abc123');
    expect(output).not.toContain('RGAPI-');
    // The masked values are still listed, so the logs show which fields were there.
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(4);
  });
});
