import type { PlayerParams } from '@statslol/shared';
import { screen, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { failure, mockPlayerApi } from '../test-api.ts';
import { PLAYER_PAGE_PATH } from '../test-data.ts';
import { PROFILE_TABS, profileTabPath } from '../profile-tabs.ts';
import { recordRequests } from '../test-server.ts';
import { renderPage } from '../test-utils.tsx';

const PLAYER: PlayerParams = {
  region: 'kr',
  name: 'Hide on bush',
  tag: 'KR1',
};

function tabBar() {
  return screen.getByRole('navigation', { name: 'Profile sections' });
}

describe('tabs of a profile', () => {
  it('are under the header, as links, the one of the open page being marked', async () => {
    mockPlayerApi();

    renderPage(PLAYER_PAGE_PATH);

    await screen.findByText('Korea · Level 812');
    const links = within(tabBar()).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(
      PROFILE_TABS.map((tab) => tab.label),
    );
    // The first tab is the profile itself.
    const [overview] = links;
    expect(overview?.getAttribute('href')).toBe(PLAYER_PAGE_PATH);
    expect(overview?.getAttribute('aria-current')).toBe('page');
  });

  it('keep the name of the player in their address, percent-encoded', async () => {
    mockPlayerApi();

    renderPage('/players/euw/100%25%20sure%3F/EUW');

    await screen.findByRole('navigation', { name: 'Profile sections' });
    expect(within(tabBar()).getAllByRole('link')[0]?.getAttribute('href')).toBe(
      '/players/euw/100%25%20sure%3F/EUW',
    );
  });

  it.each([
    [
      'a player that does not exist',
      () => new HttpResponse(null, { status: 404 }),
    ],
    ['a profile that could not be loaded', failure],
  ])('are not shown for %s', async (_case, profile) => {
    mockPlayerApi({ profile });

    renderPage(PLAYER_PAGE_PATH);

    await screen.findByRole('button', { name: /Search|Try again/ });
    expect(
      screen.queryByRole('navigation', { name: 'Profile sections' }),
    ).toBeNull();
  });

  it.each(PROFILE_TABS.map((tab) => [tab.label, tab] as const))(
    'have a page of their own: %s',
    async (_label, tab) => {
      mockPlayerApi();

      renderPage(profileTabPath(PLAYER, tab));

      await screen.findByText('Korea · Level 812');
      expect(
        screen.queryByRole('heading', { name: 'Page not found' }),
      ).toBeNull();
      const open = within(tabBar())
        .getAllByRole('link')
        .find((link) => link.getAttribute('aria-current') === 'page');
      expect(open?.textContent).toBe(tab.label);
    },
  );

  it('are the only pages under a profile: any other address is "not found", without asking the API', () => {
    const requests = recordRequests();

    renderPage(`${PLAYER_PAGE_PATH}/no-such-tab`);

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeDefined();
    expect(requests).toEqual([]);
  });
});
