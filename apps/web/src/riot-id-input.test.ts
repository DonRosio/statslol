import { describe, expect, it } from 'vitest';

import { parseRiotIdInput } from './riot-id-input.ts';

describe('parseRiotIdInput', () => {
  it.each([
    ['a name with spaces', 'Hide on bush#KR1', 'Hide on bush', 'KR1'],
    ['spaces around each part', '  Hide on bush # KR1 ', 'Hide on bush', 'KR1'],
    ['Korean', '페이커#KR1', '페이커', 'KR1'],
    ['a name with "%" and "?"', '100% sure?#EUW', '100% sure?', 'EUW'],
  ])('reads %s', (_case, text, gameName, tagLine) => {
    expect(parseRiotIdInput(text)).toEqual({
      success: true,
      riotId: { gameName, tagLine },
    });
  });

  it.each([
    ['nothing', '', 'Enter a Riot ID, e.g. Hide on bush#KR1'],
    ['only spaces', '   ', 'Enter a Riot ID, e.g. Hide on bush#KR1'],
    ['no tag', 'Hide on bush', 'Add the tag after a #, e.g. Hide on bush#KR1'],
    ['an empty name', '#KR1', 'Game name: must be 3 to 16 characters long'],
    [
      'a name too short',
      'ab#EUW',
      'Game name: must be 3 to 16 characters long',
    ],
    [
      'a forbidden character in the name',
      'a/b/c#EUW',
      'Game name: contains a character that cannot be part of a Riot ID',
    ],
    ['an empty tag', 'Hide on bush#', 'Tag: must be 3 to 5 characters long'],
    [
      'a space in the tag',
      'Hide on bush#K R1',
      'Tag: only letters and digits are allowed',
    ],
    ['a second #', 'Hide#on#bush', 'Tag: only letters and digits are allowed'],
  ])('rejects %s', (_case, text, error) => {
    expect(parseRiotIdInput(text)).toEqual({ success: false, error });
  });
});
