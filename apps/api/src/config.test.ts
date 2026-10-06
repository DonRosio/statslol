import { describe, expect, it } from 'vitest';

import {
  loadConfig,
  loadMigrationConfig,
  type ConfigResult,
} from './config.ts';

// Valid format, but cannot be a real key (allowed in .gitleaks.toml).
const FAKE_RIOT_API_KEY = 'RGAPI-00000000-0000-0000-0000-000000000000';

// The variables the API cannot start without.
const REQUIRED = {
  RIOT_API_KEY: FAKE_RIOT_API_KEY,
  REDIS_PASSWORD: 'redis-secret',
  POSTGRES_APP_PASSWORD: 'postgres-secret',
};

function expectValid<T>(result: ConfigResult<T>): T {
  if (!result.success) {
    throw new Error(`Expected a valid configuration, got:\n${result.error}`);
  }
  return result.config;
}

function expectInvalid(result: ConfigResult<unknown>): string {
  if (result.success) {
    throw new Error('Expected the configuration to be rejected');
  }
  return result.error;
}

describe('loadConfig', () => {
  it('applies the defaults when only the required variables are set', () => {
    const config = expectValid(loadConfig(REQUIRED));

    expect(config).toMatchObject({
      host: 'localhost',
      port: 3000,
      logLevel: 'info',
      // Nobody may give the address of the client: it is the address of the connection.
      trustProxy: false,
      riotKeyGeneration: 1,
      seasonSyncPaceMs: 2000,
      redis: { host: 'localhost', port: 6379 },
      // The role of the API, which can only read and write rows.
      database: {
        host: 'localhost',
        port: 5432,
        database: 'statslol',
        user: 'statslol_app',
      },
    });
    expect(config.riotApiKey.reveal()).toBe(FAKE_RIOT_API_KEY);
    expect(config.redis.password.reveal()).toBe('redis-secret');
    expect(config.database.password.reveal()).toBe('postgres-secret');
  });

  it('reads the values of the environment variables', () => {
    const config = expectValid(
      loadConfig({
        ...REQUIRED,
        HOST: '0.0.0.0',
        PORT: '8080',
        LOG_LEVEL: 'debug',
        REDIS_HOST: 'redis',
        REDIS_PORT: '6380',
        POSTGRES_HOST: 'postgres',
        POSTGRES_PORT: '5433',
        RIOT_KEY_GENERATION: '2',
        SEASON_SYNC_PACE_MS: '500',
        TRUST_PROXY: '172.30.250.1',
      }),
    );

    expect(config).toMatchObject({
      host: '0.0.0.0',
      port: 8080,
      logLevel: 'debug',
      trustProxy: ['172.30.250.1'],
      riotKeyGeneration: 2,
      seasonSyncPaceMs: 500,
      redis: { host: 'redis', port: 6380 },
      database: { host: 'postgres', port: 5433 },
    });
  });

  it('ignores the other environment variables', () => {
    const config = expectValid(loadConfig({ ...REQUIRED, PATH: '/usr/bin' }));

    expect(Object.keys(config).sort()).toEqual([
      'database',
      'host',
      'logLevel',
      'port',
      'redis',
      'riotApiKey',
      'riotKeyGeneration',
      'seasonSyncPaceMs',
      'trustProxy',
    ]);
  });

  it('treats an empty variable as not set', () => {
    expect(expectValid(loadConfig({ ...REQUIRED, PORT: '' })).port).toBe(3000);
    expect(expectInvalid(loadConfig({ RIOT_API_KEY: '' }))).toMatch(
      /Missing.*\n.*RIOT_API_KEY/,
    );
  });

  it.each(['abc', '-1', '65536', '3000.5'])('rejects PORT=%s', (port) => {
    expect(expectInvalid(loadConfig({ ...REQUIRED, PORT: port }))).toContain(
      'PORT',
    );
  });

  it('lists every invalid variable at once', () => {
    const error = expectInvalid(
      loadConfig({ PORT: 'abc', LOG_LEVEL: 'verbose' }),
    );

    expect(error).toContain('PORT');
    expect(error).toContain('LOG_LEVEL');
    expect(error).toContain('RIOT_API_KEY');
    expect(error).toContain('REDIS_PASSWORD');
    expect(error).toContain('POSTGRES_APP_PASSWORD');
  });

  it('rejects a malformed Riot API key without showing its value', () => {
    const error = expectInvalid(
      loadConfig({ ...REQUIRED, RIOT_API_KEY: 'RGAPI-my-secret-value' }),
    );

    expect(error).toContain('RIOT_API_KEY');
    expect(error).not.toContain('my-secret-value');
  });

  it('never shows the passwords once loaded', () => {
    const config = expectValid(loadConfig(REQUIRED));

    expect(JSON.stringify(config)).not.toContain('redis-secret');
    expect(JSON.stringify(config)).not.toContain('postgres-secret');
  });

  it.each(['0', '1.5', 'two', '40000'])(
    'rejects RIOT_KEY_GENERATION=%s',
    (generation) => {
      expect(
        expectInvalid(
          loadConfig({ ...REQUIRED, RIOT_KEY_GENERATION: generation }),
        ),
      ).toContain('RIOT_KEY_GENERATION');
    },
  );

  it.each(['-1', '1.5', 'slow', '60001'])(
    'rejects SEASON_SYNC_PACE_MS=%s',
    (pace) => {
      expect(
        expectInvalid(loadConfig({ ...REQUIRED, SEASON_SYNC_PACE_MS: pace })),
      ).toContain('SEASON_SYNC_PACE_MS');
    },
  );

  it('reads several proxies in TRUST_PROXY: addresses and ranges, IPv4 and IPv6', () => {
    const config = expectValid(
      loadConfig({
        ...REQUIRED,
        TRUST_PROXY: '127.0.0.1, 172.30.250.0/24,::1,fd00::/8',
      }),
    );

    expect(config.trustProxy).toEqual([
      '127.0.0.1',
      '172.30.250.0/24',
      '::1',
      'fd00::/8',
    ]);
  });

  it.each([
    ['a host name', 'caddy'],
    ['an empty entry', '127.0.0.1,'],
    ['a range too wide', '10.0.0.0/33'],
    ['an address out of range', '256.0.0.1'],
  ])('rejects TRUST_PROXY with %s', (_case, value) => {
    expect(
      expectInvalid(loadConfig({ ...REQUIRED, TRUST_PROXY: value })),
    ).toMatch(/Expected IP addresses or ranges[^\n]*\n.*TRUST_PROXY/);
  });

  it.each(['abc', '0', '65536'])('rejects REDIS_PORT=%s', (port) => {
    expect(
      expectInvalid(loadConfig({ ...REQUIRED, REDIS_PORT: port })),
    ).toContain('REDIS_PORT');
  });
});

describe('loadMigrationConfig', () => {
  it('connects as the superuser to the local database by default', () => {
    const { database } = expectValid(
      loadMigrationConfig({ POSTGRES_PASSWORD: 'db-secret' }),
    );

    expect(database).toMatchObject({
      host: 'localhost',
      port: 5432,
      database: 'statslol',
      user: 'postgres',
    });
    expect(database.password.reveal()).toBe('db-secret');
  });

  it('reads where the database is', () => {
    const { database } = expectValid(
      loadMigrationConfig({
        POSTGRES_HOST: 'postgres',
        POSTGRES_PORT: '5433',
        POSTGRES_PASSWORD: 'db-secret',
      }),
    );

    expect(database).toMatchObject({ host: 'postgres', port: 5433 });
  });

  it('never shows the password once loaded', () => {
    const config = expectValid(
      loadMigrationConfig({ POSTGRES_PASSWORD: 'db-secret' }),
    );

    expect(JSON.stringify(config)).not.toContain('db-secret');
  });

  it('requires the password, not the Riot API key', () => {
    expect(expectInvalid(loadMigrationConfig({}))).toMatch(
      /Missing.*\n.*POSTGRES_PASSWORD/,
    );
  });

  it.each(['abc', '0', '65536'])('rejects POSTGRES_PORT=%s', (port) => {
    expect(
      expectInvalid(
        loadMigrationConfig({
          POSTGRES_PASSWORD: 'db-secret',
          POSTGRES_PORT: port,
        }),
      ),
    ).toContain('POSTGRES_PORT');
  });
});
