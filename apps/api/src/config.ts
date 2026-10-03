import { z } from 'zod';

import { Secret } from './secret.ts';

// Development and production keys share this format.
const RIOT_API_KEY_FORMAT =
  /^RGAPI-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      .string({ error: 'Missing: copy .env.example to .env and fill it in' })
      .regex(
        RIOT_API_KEY_FORMAT,
        'Expected the format RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      )
      .transform((value) => new Secret(value)),
  })
  .transform((env) => ({
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    riotApiKey: env.RIOT_API_KEY,
  }));

export type Config = Readonly<z.output<typeof envSchema>>;

export type ConfigResult =
  | { readonly success: true; readonly config: Config }
  | { readonly success: false; readonly error: string };

/**
 * Validates the environment variables and turns them into a typed configuration.
 * On failure, `error` lists every invalid variable, never its value (it may be a secret).
 */
export function loadConfig(
  env: Readonly<Record<string, string | undefined>>,
): ConfigResult {
  // An empty variable (e.g. "PORT=" left in .env) counts as not set.
  const setVariables = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== ''),
  );
  const result = envSchema.safeParse(setVariables);
  return result.success
    ? { success: true, config: result.data }
    : { success: false, error: z.prettifyError(result.error) };
}
