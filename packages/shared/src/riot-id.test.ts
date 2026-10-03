import { describe, expect, it } from 'vitest';

import {
  formatRiotId,
  gameNameSchema,
  riotIdSchema,
  tagLineSchema,
} from './riot-id.ts';

// Invisible characters are built from their code point: written as is, they would not
// show in the code (and a right-to-left override would scramble how it is displayed).
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);
const COMBINING_ACUTE_ACCENT = String.fromCodePoint(0x0301);

describe('gameNameSchema', () => {
  it.each([
    ['spaces', 'Hide on bush'],
    ['accents', 'Café Crème'],
    ['Korean', '페이커'],
    ['Chinese', '我是大魔王'],
    ['Japanese', 'ゆきだるま'],
    ['Thai', 'สวัสดีครับ'],
    ['Vietnamese', 'Tiếng Việt'],
    ['Cyrillic', 'Иван Грозный'],
    ['Arabic', 'محمد علي'],
    ['only digits', '123'],
    ['16 characters', 'abcdefghijklmnop'],
  ])('accepts a name with %s: %s', (_case, name) => {
    expect(gameNameSchema.parse(name)).toBe(name);
  });

  it.each([
    ['an empty name', ''],
    ['only spaces', '   '],
    ['2 characters', 'ab'],
    ['17 characters', 'abcdefghijklmnopq'],
    ['a path', '../'],
    ['a slash', 'a/b/c'],
    ['a backslash', 'a\\b\\c'],
    ['the tag separator', 'Name#EUW'],
    ['a line break', 'two\nlines'],
    ['a tab', 'tab\there'],
    ['a zero-width space', `zero${ZERO_WIDTH_SPACE}width`],
    ['a right-to-left override', `abc${RIGHT_TO_LEFT_OVERRIDE}def`],
    ['hundreds of stacked accents', 'abc' + COMBINING_ACUTE_ACCENT.repeat(100)],
  ])('rejects %s', (_case, name) => {
    expect(gameNameSchema.safeParse(name).success).toBe(false);
  });

  it('counts characters as they are displayed', () => {
    const thaiCharacter = 'ที่'; // one character on screen, three code points
    expect(thaiCharacter).toHaveLength(3);

    expect(gameNameSchema.safeParse(thaiCharacter.repeat(16)).success).toBe(
      true,
    );
    expect(gameNameSchema.safeParse(thaiCharacter.repeat(17)).success).toBe(
      false,
    );
  });

  it('gives the same name whichever way the accents were typed', () => {
    const accentAsTwoCodePoints = 'Cafe' + COMBINING_ACUTE_ACCENT;
    const accentAsOneCodePoint = 'Caf' + String.fromCodePoint(0xe9);
    expect(accentAsTwoCodePoints).not.toBe(accentAsOneCodePoint);

    expect(gameNameSchema.parse(accentAsTwoCodePoints)).toBe(
      accentAsOneCodePoint,
    );
    expect(gameNameSchema.parse('페이커'.normalize('NFD'))).toBe('페이커');
  });

  it('removes the spaces around the name', () => {
    expect(gameNameSchema.parse('  Hide on bush  ')).toBe('Hide on bush');
  });
});

describe('tagLineSchema', () => {
  it.each(['EUW', 'KR1', '0000', 'abcde', '日本語', 'ที่สุด'])(
    'accepts %s',
    (tagLine) => {
      expect(tagLineSchema.parse(tagLine)).toBe(tagLine);
    },
  );

  it.each([
    ['an empty tag', ''],
    ['2 characters', 'EU'],
    ['6 characters', 'EUW123'],
    ['a space', 'E W'],
    ['a dash', 'EU-W'],
    ['a path', '../'],
    ['the separator', '#EUW'],
  ])('rejects %s', (_case, tagLine) => {
    expect(tagLineSchema.safeParse(tagLine).success).toBe(false);
  });

  it('removes the spaces around the tag', () => {
    expect(tagLineSchema.parse(' EUW ')).toBe('EUW');
  });
});

describe('riotIdSchema', () => {
  it('validates and cleans up both parts', () => {
    expect(
      riotIdSchema.parse({ gameName: ' Hide on bush ', tagLine: ' KR1 ' }),
    ).toEqual({ gameName: 'Hide on bush', tagLine: 'KR1' });
  });

  it('reports which part is invalid', () => {
    const result = riotIdSchema.safeParse({ gameName: '../', tagLine: 'EUW' });

    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['gameName'],
    ]);
  });
});

describe('formatRiotId', () => {
  it('joins the game name and the tag line with a hash', () => {
    expect(formatRiotId({ gameName: 'Example Player', tagLine: 'EUW' })).toBe(
      'Example Player#EUW',
    );
  });
});
