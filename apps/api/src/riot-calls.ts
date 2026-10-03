import { AsyncLocalStorage } from 'node:async_hooks';

import type { RiotCall } from '@statslol/riot-client';
import {
  LogController,
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Requests sent to the Riot API to answer this request. */
    riotCalls: number;
  }
}

// The request that the code running at this moment works for. AsyncLocalStorage follows
// what a request starts (awaits, callbacks), so a call to Riot made deep inside the cache
// knows which request it is for, without passing the request down to it.
const currentRequest = new AsyncLocalStorage<FastifyRequest>();

/** Counts the requests that each request to the API sends to Riot. */
export function countRiotCalls(app: FastifyInstance): void {
  app.decorateRequest('riotCalls', 0);
  // The last hook before the handler: everything the handler starts runs in this context.
  app.addHook('preHandler', (request, _reply, done) => {
    currentRequest.run(request, done);
  });
}

/**
 * Records a request sent to Riot (for the `onCall` option of the Riot client): counts it for
 * the current request and logs it, with the request id. A call shared by several requests
 * (single-flight) counts for the one that made it.
 */
export function recordRiotCall(log: FastifyBaseLogger, call: RiotCall): void {
  const request = currentRequest.getStore();
  if (request !== undefined) request.riotCalls += 1;
  (request?.log ?? log).debug(call, 'Riot API call');
}

/** Fastify's log line at the end of each request, with the number of Riot calls it made. */
export class RiotCallsLogController extends LogController {
  override requestCompleted(
    error: Error | null | undefined,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    if (this.isLogDisabled(request)) return;

    const details = {
      res: reply,
      responseTime: reply.elapsedTime,
      riotCalls: request.riotCalls,
    };
    if (error) {
      reply.log.error({ ...details, err: error }, 'request errored');
    } else {
      reply.log.info(details, 'request completed');
    }
  }
}
