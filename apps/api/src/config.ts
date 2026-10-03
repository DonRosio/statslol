import { z } from 'zod';

import type { RedisConnection } from './cache/redis-store.ts';
import type { DatabaseConnection } from './db/connection.ts';
import { Secret } from './secret.ts';

// Development and production keys share this format.
const RIOT_API_KEY_FORMAT =
  /^RGAPI-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MISSING = 'Missing: copy .env.example to .env and fill it in';

// Port of a service the API connects to (PostgreSQL, Redis).
const servicePortSchema = z.coerce.number().int().min(1).max(65_535);

/** A password: once validated, it can only be read with reveal(). */
const passwordSchema = z
  .string({ error: MISSING })
  .transform((value) => new Secret(value));

// The database created by compose.yaml; its superuser, who runs the migrations; and the
// role of the API, created by docker/postgres/initdb, which can only read and write rows.
const DATABASE_NAME = 'statslol';
const DATABASE_SUPERUSER = 'postgres';
export const DATABASE_APP_ROLE = 'statslol_app';

/** Environment variables read by the API: validation rules and default values. */
const envSchema = z
  .object({
    // "localhost" only accepts connections from this machine; a container sets 0.0.0.0.
    HOST: z.string().default('localhost'),
    // 0 picks a random free port (used by the tests).
    PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    RIOT_API_KEY: z
      .string({ error: MISSING })
      .regex(
        RIOT_API_KEY_FORMAT,
        'Expected the format RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      )
      .transform((value) => new Secret(value)),
    // Riot encrypts PUUIDs with a key specific to each application: to be incremented when
    // RIOT_API_KEY becomes the key of another application (development key → personal key).
    RIOT_KEY_GENERATION: z.coerce.number().int().min(1).max(32_767).default(1),
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: servicePortSchema.default(6379),
    REDIS_PASSWORD: passwordSchema,
    POSTGRES_HOST: z.string().default('localhost'),
    POSTGRES_PORT: servicePortSchema.default(5432),
    POSTGRES_APP_PASSWORD: passwordSchema,
  })
  .transform((env) => ({
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    riotApiKey: env.RIOT_API_KEY,
    riotKeyGeneration: env.RIOT_KEY_GENERATION,
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
    } satisfies RedisConnection,
    database: {
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: DATABASE_NAME,
      user: DATABASE_APP_ROLE,
      password: env.POSTGRES_APP_PASSWORD,
    } satisfies DatabaseConnection,
  }));

/** Environment variables read by `pnpm db:migrate`. */
const migrationEnvSchema = z
  .object({
    POSTGRES_HOST: z.string().default('localhost'),
    POSTGRES_PORT: servicePortSchema.default(5432),
    POSTGRES_PASSWORD: passwordSchema,
  })
  .transform((env): { database: DatabaseConnection } => ({
    database: {
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: DATABASE_NAME,
      user: DATABASE_SUPERUSER,
      password: env.POSTGRES_PASSWORD,
    },
  }));

export type Config = Readonly<z.output<typeof envSchema>>;

export type MigrationConfig = Readonly<z.output<typeof migrationEnvSchema>>;

export type ConfigResult<T> =
  | { readonly success: true; readonly config: T }
  | { readonly success: false; readonly error: string };

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Validates the environment variables of the API and turns them into a typed configuration.
 * On failure, `error` lists every invalid variable, never its value (it may be a secret).
 */
export function loadConfig(env: Env): ConfigResult<Config> {
  return parseEnv(envSchema, env);
}

/** Same as loadConfig, for the variables of `pnpm db:migrate`. */
export function loadMigrationConfig(env: Env): ConfigResult<MigrationConfig> {
  return parseEnv(migrationEnvSchema, env);
}

function parseEnv<T>(schema: z.ZodType<T>, env: Env): ConfigResult<T> {
  // An empty variable (e.g. "PORT=" left in .env) counts as not set.
  const setVariables = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== ''),
  );
  const result = schema.safeParse(setVariables);
  return result.success
    ? { success: true, config: result.data }
    : { success: false, error: z.prettifyError(result.error) };
}
