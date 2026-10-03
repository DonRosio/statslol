// A valid configuration for the tests: placeholder secrets, no logs.
import type { Config } from './config.ts';
import { Secret } from './secret.ts';

export const TEST_CONFIG: Config = {
  host: 'localhost',
  port: 0,
  logLevel: 'silent',
  riotApiKey: new Secret('RGAPI-test-key'),
  riotKeyGeneration: 1,
  redis: { host: 'localhost', port: 6379, password: new Secret('unused') },
  database: {
    host: 'localhost',
    port: 5432,
    database: 'statslol',
    user: 'statslol_app',
    password: new Secret('unused'),
  },
};
