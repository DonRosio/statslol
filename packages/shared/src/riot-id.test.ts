import { describe, expect, it } from 'vitest';

import { formatRiotId } from './riot-id.ts';

describe('formatRiotId', () => {
  it('joins the game name and the tag line with a hash', () => {
    expect(formatRiotId({ gameName: 'Example Player', tagLine: 'EUW' })).toBe(
      'Example Player#EUW',
    );
  });
});
