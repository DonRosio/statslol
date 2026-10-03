import { riotIdSchema, type RiotId } from '@statslol/shared';

export type RiotIdInputResult =
  | { readonly success: true; readonly riotId: RiotId }
  | { readonly success: false; readonly error: string };

const EXAMPLE = 'Hide on bush#KR1';

/**
 * Reads a Riot ID typed in one piece, the way players share it ("Hide on bush#KR1"). Both
 * parts are checked with the rules the API applies (riotIdSchema of packages/shared), so an
 * invalid Riot ID is reported at once, without a request to the API.
 */
export function parseRiotIdInput(text: string): RiotIdInputResult {
  if (text.trim() === '') {
    return { success: false, error: `Enter a Riot ID, e.g. ${EXAMPLE}` };
  }
  // A game name cannot contain "#": the first one separates it from the tag.
  const separator = text.indexOf('#');
  if (separator === -1) {
    return {
      success: false,
      error: `Add the tag after a #, e.g. ${EXAMPLE}`,
    };
  }
  const result = riotIdSchema.safeParse({
    gameName: text.slice(0, separator),
    tagLine: text.slice(separator + 1),
  });
  if (result.success) {
    return { success: true, riotId: result.data };
  }
  // Reports the first problem, with the part of the Riot ID it is about.
  const [issue] = result.error.issues;
  const part = issue?.path[0] === 'tagLine' ? 'Tag' : 'Game name';
  const message = issue?.message ?? 'Invalid';
  return {
    success: false,
    error: `${part}: ${message.charAt(0).toLowerCase()}${message.slice(1)}`,
  };
}
