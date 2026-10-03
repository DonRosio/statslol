import { inspect } from 'node:util';

const REDACTED = '[REDACTED]';

/**
 * Holds a sensitive value (API key, password, token) so that it cannot leak by accident:
 * printing it, logging it or serializing it to JSON only shows "[REDACTED]".
 * Call `reveal()` only where the real value is needed, e.g. when building a request header.
 */
export class Secret {
  // A private field (#) cannot be read from outside the class, and JSON.stringify ignores it.
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  // Called by String(secret) and template literals.
  toString(): string {
    return REDACTED;
  }

  // Called by JSON.stringify, and therefore by the logger.
  toJSON(): string {
    return REDACTED;
  }

  // Called by console.log and util.inspect.
  [inspect.custom](): string {
    return REDACTED;
  }
}
