// A logger for the tests, which records what is logged.
import type { FastifyBaseLogger } from 'fastify';
import { vi } from 'vitest';

type LogMethod = (details: unknown, message?: string) => void;

export function fakeLogger() {
  const log = {
    level: 'trace',
    fatal: vi.fn<LogMethod>(),
    error: vi.fn<LogMethod>(),
    warn: vi.fn<LogMethod>(),
    info: vi.fn<LogMethod>(),
    debug: vi.fn<LogMethod>(),
    trace: vi.fn<LogMethod>(),
    silent: vi.fn<LogMethod>(),
    child: (): FastifyBaseLogger => log,
  };
  return log;
}
