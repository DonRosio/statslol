import { describe, expect, it } from 'vitest';

import { playerPath } from './player-path.ts';

describe('playerPath', () => {
  it('builds the URL of the profile page', () => {
    expect(playerPath({ region: 'euw', name: 'Example', tag: 'EUW' })).toBe(
      '/players/euw/Example/EUW',
    );
  });

  it.each([
    ['spaces', 'Hide on bush', 'Hide%20on%20bush'],
    ['"%" and "?"', '100% sure?', '100%25%20sure%3F'],
    ['Korean', '페이커', '%ED%8E%98%EC%9D%B4%EC%BB%A4'],
  ])('encodes %s', (_case, name, encoded) => {
    expect(playerPath({ region: 'kr', name, tag: 'KR1' })).toBe(
      `/players/kr/${encoded}/KR1`,
    );
  });
});
