import { z } from 'zod';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Counts characters the way they are displayed. `string.length` counts UTF-16 code units
 * instead: the Thai "ที่" is a single character, but its length is 3.
 */
function countCharacters(text: string): number {
  return [...graphemes.segment(text)].length;
}

function hasCharacterCount(min: number, max: number) {
  return (text: string) => {
    const count = countCharacters(text);
    return count >= min && count <= max;
  };
}

/**
 * Steps shared by both parts of a Riot ID:
 * - remove the spaces around the text, often typed or pasted by mistake;
 * - normalize to NFC: "é" can be typed as one code point or as "e" + an accent, and both
 *   must give the same name (for Riot and for our cache);
 * - reject a text too long to be valid before counting its characters: a character rarely
 *   needs more than 4 code units, more means abuse (e.g. hundreds of stacked accents).
 */
function riotIdText(maxCharacters: number) {
  return z
    .string()
    .trim()
    .normalize('NFC')
    .max(maxCharacters * 4, { error: 'Too long', abort: true });
}

// Riot only allows "alphanumeric characters", but real names also contain spaces, letters
// from every script and some symbols: rejecting a real name would make that player
// impossible to find. So only characters that can never be part of a name are refused:
// invisible and control characters, line breaks, "#" (it separates the name from the tag)
// and the path separators "/" and "\".
const FORBIDDEN_IN_GAME_NAME = /[\p{C}\p{Zl}\p{Zp}#/\\]/u;

export const gameNameSchema = riotIdText(16)
  .refine(
    (name) => !FORBIDDEN_IN_GAME_NAME.test(name),
    'Contains a character that cannot be part of a Riot ID',
  )
  .refine(hasCharacterCount(3, 16), 'Must be 3 to 16 characters long');

// Letters of any script, with their accents (\p{M}), and digits.
const TAG_LINE_FORMAT = /^[\p{L}\p{M}\p{N}]*$/u;

export const tagLineSchema = riotIdText(5)
  .regex(TAG_LINE_FORMAT, 'Only letters and digits are allowed')
  .refine(hasCharacterCount(3, 5), 'Must be 3 to 5 characters long');

export const riotIdSchema = z.object({
  gameName: gameNameSchema,
  tagLine: tagLineSchema,
});

/** A player's public identifier, displayed as `gameName#tagLine`. */
export type RiotId = Readonly<z.output<typeof riotIdSchema>>;

export function formatRiotId({ gameName, tagLine }: RiotId): string {
  return `${gameName}#${tagLine}`;
}
