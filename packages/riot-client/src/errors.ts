/**
 * What went wrong when calling Riot, so that callers can react without reading messages:
 * - "rate-limited": 429, our request quota is used up; wait `retryAfterSeconds`;
 * - "unavailable": Riot could not be reached or answered with a server error (5xx);
 * - "timeout": Riot did not answer in time;
 * - "unauthorized": 401 or 403, the API key is missing, invalid or expired;
 * - "unexpected-response": any other answer (unexpected status code, invalid JSON, data
 *   in an unexpected format). It usually means a bug on our side or a change at Riot.
 */
export type RiotApiErrorKind =
  | 'rate-limited'
  | 'unavailable'
  | 'timeout'
  | 'unauthorized'
  | 'unexpected-response';

interface RiotApiErrorOptions {
  readonly status?: number | undefined;
  readonly retryAfterSeconds?: number | undefined;
  readonly cause?: unknown;
}

export class RiotApiError extends Error {
  override readonly name = 'RiotApiError';
  readonly kind: RiotApiErrorKind;
  /** HTTP status code of Riot's answer, if Riot answered. */
  readonly status: number | undefined;
  /** For "rate-limited": how long Riot asks us to wait before trying again. */
  readonly retryAfterSeconds: number | undefined;

  constructor(
    kind: RiotApiErrorKind,
    message: string,
    options: RiotApiErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.kind = kind;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
