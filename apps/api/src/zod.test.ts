import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { zodSerializerCompiler, zodValidatorCompiler } from './zod.ts';

const schema = z.object({ name: z.string().trim().min(3) });

describe('zodValidatorCompiler', () => {
  const validate = zodValidatorCompiler({ schema, method: 'GET', url: '/' });

  it('gives the handler the cleaned-up values', () => {
    expect(validate({ name: '  Faker  ' })).toEqual({
      value: { name: 'Faker' },
    });
  });

  it('describes each problem with the name of the field', () => {
    expect(validate({ name: 'ab' })).toEqual({
      error: new Error(
        'name: Too small: expected string to have >=3 characters',
      ),
    });
  });
});

describe('zodSerializerCompiler', () => {
  const serialize = zodSerializerCompiler({ schema, method: 'GET', url: '/' });

  it('leaves out the fields the schema does not declare', () => {
    expect(serialize({ name: 'Faker', puuid: 'not-for-clients' })).toBe(
      '{"name":"Faker"}',
    );
  });

  it('refuses an answer that does not match its schema', () => {
    expect(() => serialize({ name: 42 })).toThrow();
  });
});
