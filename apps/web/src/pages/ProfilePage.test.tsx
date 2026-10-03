import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderPage } from '../test-utils.tsx';

describe('profile page', () => {
  it('shows whose profile it is', () => {
    renderPage('/players/kr/Hide%20on%20bush/KR1');

    expect(
      screen.getByRole('heading', { name: 'Hide on bush#KR1' }),
    ).toBeDefined();
    expect(screen.getByText('Korea')).toBeDefined();
  });

  it.each([
    ['an unknown region', '/players/xx/Hide%20on%20bush/KR1'],
    ['a name too short', '/players/euw/ab/EUW'],
    ['a forbidden character', '/players/euw/a%5Cb%5Cc/EUW'],
    ['a tag too long', '/players/euw/Hide%20on%20bush/EUW123'],
  ])('is "not found" for %s', (_case, path) => {
    renderPage(path);

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeDefined();
  });
});
