import { describe, expect, it } from 'vitest';

import { matchSummary } from '../test-data.ts';
import { uniqueMatches } from './players.ts';

describe('uniqueMatches', () => {
  it('puts the pages one after the other', () => {
    const pages = [
      { matches: [matchSummary('KR_4'), matchSummary('KR_3')], nextStart: 2 },
      { matches: [matchSummary('KR_2')], nextStart: null },
    ];

    expect(uniqueMatches(pages).map((match) => match.id)).toEqual([
      'KR_4',
      'KR_3',
      'KR_2',
    ]);
  });

  it('keeps once a match that a new game pushed to the next page', () => {
    const pages = [
      { matches: [matchSummary('KR_4'), matchSummary('KR_3')], nextStart: 2 },
      // KR_5 was played meanwhile: KR_3, last of the first page, is now 3rd.
      { matches: [matchSummary('KR_3'), matchSummary('KR_2')], nextStart: 4 },
    ];

    expect(uniqueMatches(pages).map((match) => match.id)).toEqual([
      'KR_4',
      'KR_3',
      'KR_2',
    ]);
  });
});
