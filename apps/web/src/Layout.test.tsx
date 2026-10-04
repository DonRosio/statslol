import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { recordRequests, server } from './test-server.ts';
import { renderPage } from './test-utils.tsx';

beforeEach(() => {
  server.use(
    http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),
    // A search opens a profile page, which asks the API about the player: these tests only
    // look at the URL and at the header.
    http.get('/api/v1/*', () => delay('infinite')),
  );
});

function headerSearch() {
  return screen.getByRole('search', { name: 'Look up another player' });
}

function regionField() {
  return within(headerSearch()).getByRole('combobox', {
    name: 'Region of the player to look up',
  });
}

function riotIdField() {
  return within(headerSearch()).getByRole('textbox', {
    name: 'Riot ID of the player to look up',
  });
}

async function lookUp(riotId: string) {
  const user = userEvent.setup();
  await user.type(riotIdField(), riotId);
  await user.click(
    within(headerSearch()).getByRole('button', { name: 'Look up' }),
  );
  return user;
}

describe('search in the header', () => {
  it('is not on the home page, which is a search form already', () => {
    renderPage('/');

    expect(
      screen.queryByRole('search', { name: 'Look up another player' }),
    ).toBeNull();
    expect(screen.getAllByRole('search')).toHaveLength(1);
  });

  it('is on the other pages, with a link to the home page', () => {
    renderPage('/no/such/page');

    expect(headerSearch()).toBeDefined();
    expect(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole(
        'link',
        { name: 'statslol' },
      ),
    ).toHaveProperty('pathname', '/');
  });

  it('shows only the code of the regions', () => {
    renderPage('/no/such/page');

    expect(
      within(regionField()).getByRole('option', { name: 'KR' }),
    ).toBeDefined();
  });

  it("starts on the server of the player's page", () => {
    renderPage('/players/kr/Hide%20on%20bush/KR1');

    expect(regionField()).toHaveProperty('value', 'kr');
  });

  it('opens another player from a profile page, with an empty field', async () => {
    const { router } = renderPage('/players/kr/Hide%20on%20bush/KR1');

    await lookUp('Faker#KR1');

    expect(router.state.location.pathname).toBe('/players/kr/Faker/KR1');
    expect(
      screen.getByRole('heading', { name: 'Faker#KR1', level: 1 }),
    ).toBeDefined();
    expect(riotIdField()).toHaveProperty('value', '');
  });

  it("follows the server of the new player's page", async () => {
    renderPage('/players/kr/Hide%20on%20bush/KR1');
    const user = userEvent.setup();

    await user.selectOptions(regionField(), 'na');
    await lookUp('Doublelift#NA1');

    expect(regionField()).toHaveProperty('value', 'na');
  });

  it('remembers the server of the last search on the other pages', async () => {
    const { router } = renderPage('/players/kr/Hide%20on%20bush/KR1');
    const user = userEvent.setup();

    await user.selectOptions(regionField(), 'na');
    await lookUp('Doublelift#NA1');
    await user.click(screen.getByRole('link', { name: 'statslol' }));

    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('combobox', { name: 'Region' })).toHaveProperty(
      'value',
      'na',
    );
  });

  it('reports an invalid Riot ID without sending any request to the API', async () => {
    renderPage('/players/kr/Hide%20on%20bush/KR1');
    const requests = recordRequests();

    await lookUp('Faker');

    expect(within(headerSearch()).getByRole('alert')).toHaveProperty(
      'textContent',
      'Add the tag after a #, e.g. Hide on bush#KR1',
    );
    expect(
      requests.filter((path) => path.startsWith('/api/v1/players/kr/Faker')),
    ).toEqual([]);
  });
});
