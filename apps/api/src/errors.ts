import { STATUS_CODES } from 'node:http';

import { RiotApiError, type RiotApiErrorKind } from '@statslol/riot-client';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

/** An error whose status code and message are meant for the client, e.g. a 404. */
export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

// How a failure of the Riot API is reported to our clients. The problem is not in their
// request and they cannot fix it: the details stay in our logs, and the answer only says
// whether trying again later makes sense.
const RIOT_FAILURES: Record<
  RiotApiErrorKind,
  { readonly statusCode: number; readonly message: string }
> = {
  'rate-limited': {
    statusCode: 503,
    message: 'Too many requests to the Riot API, try again later',
  },
  unavailable: {
    statusCode: 502,
    message: 'The Riot API is unavailable, try again later',
  },
  timeout: {
    statusCode: 504,
    message: 'The Riot API did not answer in time, try again later',
  },
  unauthorized: {
    statusCode: 503,
    message: 'The Riot API cannot be used at the moment',
  },
  'unexpected-response': {
    statusCode: 502,
    message: 'Unexpected answer from the Riot API',
  },
};

/**
 * Answers the Riot API failures. Any other error is passed on (by throwing it again) to
 * Fastify's default handler: 400 for an invalid request, `statusCode` for an HttpError...
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!(error instanceof RiotApiError)) throw error;

  // A refused key or an unknown format needs us to act; the other failures are temporary.
  const needsAction =
    error.kind === 'unauthorized' || error.kind === 'unexpected-response';
  request.log[needsAction ? 'error' : 'warn'](
    { err: error },
    'Riot API call failed',
  );

  const { statusCode, message } = RIOT_FAILURES[error.kind];
  if (error.retryAfterSeconds !== undefined) {
    reply.header('Retry-After', String(error.retryAfterSeconds));
  }
  return reply
    .code(statusCode)
    .send({ statusCode, error: STATUS_CODES[statusCode], message });
}
