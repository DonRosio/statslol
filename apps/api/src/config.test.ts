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
      redis: { host: 'localhost', port: 6379 },
    });
    expect(config.riotApiKey.reveal()).toBe(FAKE_RIOT_API_KEY);
    expect(config.redis.password.reveal()).toBe('redis-secret');
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
      }),
    );

    expect(config).toMatchObject({
      host: '0.0.0.0',
      port: 8080,
      logLevel: 'debug',
      redis: { host: 'redis', port: 6380 },
    });
  });

  it('ignores the other environment variables', () => {
    const config = expectValid(loadConfig({ ...REQUIRED, PATH: '/usr/bin' }));

    expect(Object.keys(config).sort()).toEqual([
      'host',
      'logLevel',
      'port',
      'redis',
      'riotApiKey',
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
