import { describe, expect, it } from 'vitest';

import { loadConfig, type Config } from './config.ts';

// Valid format, but cannot be a real key (allowed in .gitleaks.toml).
const FAKE_RIOT_API_KEY = 'RGAPI-00000000-0000-0000-0000-000000000000';

function expectValid(env: Record<string, string>): Config {
  const result = loadConfig(env);
  if (!result.success) {
    throw new Error(`Expected a valid configuration, got:\n${result.error}`);
  }
  return result.config;
}

function expectInvalid(env: Record<string, string>): string {
  const result = loadConfig(env);
  if (result.success) {
    throw new Error('Expected the configuration to be rejected');
  }
  return result.error;
}

describe('loadConfig', () => {
  it('applies the defaults when only the required variables are set', () => {
    const config = expectValid({ RIOT_API_KEY: FAKE_RIOT_API_KEY });

    expect(config).toMatchObject({
      host: 'localhost',
      port: 3000,
      logLevel: 'info',
    });
    expect(config.riotApiKey.reveal()).toBe(FAKE_RIOT_API_KEY);
  });

  it('reads the values of the environment variables', () => {
    const config = expectValid({
      HOST: '0.0.0.0',
      PORT: '8080',
      LOG_LEVEL: 'debug',
      RIOT_API_KEY: FAKE_RIOT_API_KEY,
    });

    expect(config).toMatchObject({
      host: '0.0.0.0',
      port: 8080,
      logLevel: 'debug',
    });
  });

  it('ignores the other environment variables', () => {
    const config = expectValid({
      RIOT_API_KEY: FAKE_RIOT_API_KEY,
      PATH: '/usr/bin',
    });

    expect(Object.keys(config).sort()).toEqual([
      'host',
      'logLevel',
      'port',
      'riotApiKey',
    ]);
  });

  it('treats an empty variable as not set', () => {
    expect(
      expectValid({ RIOT_API_KEY: FAKE_RIOT_API_KEY, PORT: '' }).port,
    ).toBe(3000);
    expect(expectInvalid({ RIOT_API_KEY: '' })).toMatch(
      /Missing.*\n.*RIOT_API_KEY/,
    );
  });

  it.each(['abc', '-1', '65536', '3000.5'])('rejects PORT=%s', (port) => {
    expect(
      expectInvalid({ RIOT_API_KEY: FAKE_RIOT_API_KEY, PORT: port }),
    ).toContain('PORT');
  });

  it('lists every invalid variable at once', () => {
    const error = expectInvalid({ PORT: 'abc', LOG_LEVEL: 'verbose' });

    expect(error).toContain('PORT');
    expect(error).toContain('LOG_LEVEL');
    expect(error).toContain('RIOT_API_KEY');
  });

  it('rejects a malformed Riot API key without showing its value', () => {
    const error = expectInvalid({ RIOT_API_KEY: 'RGAPI-my-secret-value' });

    expect(error).toContain('RIOT_API_KEY');
    expect(error).not.toContain('my-secret-value');
  });
});
