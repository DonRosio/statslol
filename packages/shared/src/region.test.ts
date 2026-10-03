import { describe, expect, it } from 'vitest';

import { DEFAULT_REGION, regionSchema } from './region.ts';

describe('regionSchema', () => {
  it.each(['euw', 'kr', 'na', 'sea'])('accepts %s', (region) => {
    expect(regionSchema.parse(region)).toBe(region);
  });

  it.each([
    ['an uppercase region', 'EUW'],
    ['a Riot platform', 'euw1'],
    ['a Riot regional route', 'europe'],
    ['a server merged into SEA', 'ph'],
    ['an empty value', ''],
    ['a path', '../'],
  ])('rejects %s: %j', (_case, region) => {
    expect(regionSchema.safeParse(region).success).toBe(false);
  });

  it('defaults to EUW', () => {
    expect(regionSchema.parse(DEFAULT_REGION)).toBe('euw');
  });
});
