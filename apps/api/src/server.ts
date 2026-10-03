// Entry point: reads the configuration, then starts the API.
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

const loaded = loadConfig(process.env);
if (!loaded.success) {
  // Fail fast: refuse to start, rather than fail later on the first request that needs the value.
  console.error(
    `Invalid configuration, the API cannot start:\n${loaded.error}`,
  );
  process.exit(1);
}
const { config } = loaded;

const app = buildApp(config);
app.log.info({ config }, 'configuration loaded');

// Graceful shutdown on Ctrl+C (SIGINT) or `docker stop` (SIGTERM): stop accepting connections,
// let the requests in progress finish, then exit. `once`: a second signal kills the process.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app.close().catch((error: unknown) => {
      app.log.error(error, 'shutdown failed');
      process.exitCode = 1;
    });
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.fatal(error, 'server failed to start');
  process.exit(1);
}
