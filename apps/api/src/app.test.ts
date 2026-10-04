import { describe, expect, it, onTestFinished } from 'vitest';

import { buildApp, type AppOptions } from './app.ts';
import { MemoryStore } from './cache/memory-store.ts';
import type { Config } from './config.ts';
import { MemoryMatchStore } from './db/memory-match-store.ts';
import { Secret } from './secret.ts';
import { TEST_CONFIG } from './test-config.ts';

const config: Config = {
  ...TEST_CONFIG,
  redis: { ...TEST_CONFIG.redis, password: new Secret('redis-test-password') },
  database: {
    ...TEST_CONFIG.database,
    password: new Secret('postgres-test-password'),
  },
};

function createApp(overrides: Partial<Config> = {}, options?: AppOptions) {
  const app = buildApp(
    { ...config, ...overrides },
    {
      cacheStore: new MemoryStore(),
      matchStore: new MemoryMatchStore(),
      ...options,
    },
  );
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
    expect(output).not.toContain('redis-test-password');
    expect(output).not.toContain('postgres-test-password');
    // The masked values are still listed, so the logs show which fields were there.
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(6);
  });
});

describe('behind a reverse proxy', () => {
  // The address of the client as the API sees it, from the log line of the request.
  async function clientAddress(
    trustProxy: Config['trustProxy'],
    connectionFrom: string,
  ) {
    const lines: string[] = [];
    const app = createApp(
      { logLevel: 'info', trustProxy },
      { logStream: { write: (line) => lines.push(line) } },
    );
    await app.inject({
      method: 'GET',
      url: '/api/health',
      remoteAddress: connectionFrom,
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    const entries = lines.map(
      (line) =>
        JSON.parse(line) as { msg?: string; req?: { remoteAddress?: string } },
    );
    return entries.find((entry) => entry.msg === 'incoming request')?.req
      ?.remoteAddress;
  }

  it('takes the address of the client from a trusted proxy', async () => {
    expect(await clientAddress(['172.30.250.1'], '172.30.250.1')).toBe(
      '203.0.113.7',
    );
  });

  it('ignores the address sent by anyone else', async () => {
    expect(await clientAddress(['172.30.250.1'], '198.51.100.9')).toBe(
      '198.51.100.9',
    );
  });

  it('trusts nobody by default', async () => {
    expect(await clientAddress(false, '172.30.250.1')).toBe('172.30.250.1');
  });
});

describe('security', () => {
  it.each([
    ['a normal answer', '/api/health', 200],
    ['an error', '/does-not-exist', 404],
  ])('sends the security headers with %s', async (_case, url, statusCode) => {
    const response = await createApp().inject({ method: 'GET', url });

    expect(response.statusCode).toBe(statusCode);
    expect(response.headers).toMatchObject({
      'content-security-policy': "default-src 'none';frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'cross-origin-resource-policy': 'same-origin',
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
    });
  });

  it('does not let other websites read its answers (no CORS)', async () => {
    const response = await createApp().inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://attacker.example' },
    });

    expect(response.headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('never rate limits the health check', async () => {
    const app = createApp();

    for (let request = 1; request <= 100; request++) {
      const response = await app.inject({ method: 'GET', url: '/api/health' });
      expect(response.statusCode).toBe(200);
    }
  });
});
