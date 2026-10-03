import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { Secret } from './secret.ts';

describe('Secret', () => {
  const secret = new Secret('my-password');

  it('gives the real value through reveal()', () => {
    expect(secret.reveal()).toBe('my-password');
  });

  it('is masked when converted to a string', () => {
    expect(String(secret)).toBe('[REDACTED]');
  });

  it('is masked when serialized to JSON', () => {
    expect(JSON.stringify({ password: secret })).toBe(
      '{"password":"[REDACTED]"}',
    );
  });

  it('is masked when printed with console.log or util.inspect', () => {
    expect(inspect({ password: secret })).toBe('{ password: [REDACTED] }');
  });
});
