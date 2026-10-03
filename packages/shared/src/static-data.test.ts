import { describe, expect, it } from 'vitest';

import { staticDataSchema } from './static-data.ts';

const VALID = {
  version: '16.19.1',
  champions: { '62': { id: 'MonkeyKing', name: 'Wukong' } },
};

describe('staticDataSchema', () => {
  it('accepts a version and champions by ID', () => {
    expect(staticDataSchema.parse(VALID)).toEqual(VALID);
  });

  it.each([
    ['a version that is a path', { ...VALID, version: '../16.19.1' }],
    [
      'a champion ID that is a path',
      {
        ...VALID,
        champions: { '62': { id: '../MonkeyKing', name: 'Wukong' } },
      },
    ],
    [
      'a champion keyed by name',
      {
        ...VALID,
        champions: { MonkeyKing: { id: 'MonkeyKing', name: 'Wukong' } },
      },
    ],
  ])('rejects %s', (_case, data) => {
    expect(staticDataSchema.safeParse(data).success).toBe(false);
  });
});
