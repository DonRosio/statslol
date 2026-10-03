import { describe, expect, it } from 'vitest';

import { playerParamsSchema } from './player-params.ts';

describe('playerParamsSchema', () => {
  it('validates and cleans up the parts of a player URL', () => {
    expect(
      playerParamsSchema.parse({
        region: 'kr',
        name: ' Hide on bush ',
        tag: 'KR1',
      }),
    ).toEqual({ region: 'kr', name: 'Hide on bush', tag: 'KR1' });
  });

  it.each([
    ['an unknown region', { region: 'xx', name: 'Hide on bush', tag: 'KR1' }],
    ['an invalid name', { region: 'kr', name: '../', tag: 'KR1' }],
    ['an invalid tag', { region: 'kr', name: 'Hide on bush', tag: 'K R1' }],
  ])('rejects %s', (_case, params) => {
    expect(playerParamsSchema.safeParse(params).success).toBe(false);
  });
});
