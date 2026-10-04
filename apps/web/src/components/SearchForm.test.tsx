import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { recordRequests, server } from '../test-server.ts';
import { renderPage } from '../test-utils.tsx';

beforeEach(() => {
  server.use(
    // The home page also shows the status of the API.
    http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),
    // A search opens the profile page, which asks the API about the player: these tests
    // only look at the URL it opened.
    http.get('/api/v1/*', () => delay('infinite')),
  );
});

function riotIdField() {
  return screen.getByRole('textbox', { name: 'Riot ID' });
}

function regionField() {
  return screen.getByRole('combobox', { name: 'Region' });
}

async function search(riotId: string) {
  const user = userEvent.setup();
  if (riotId !== '') {
    await user.type(riotIdField(), riotId);
  }
  await user.click(screen.getByRole('button', { name: 'Search' }));
  return user;
}

describe('search form', () => {
  it('offers every region, EUW by default', () => {
    renderPage('/');

    expect(screen.getAllByRole('option')).toHaveLength(15);
    expect(regionField()).toHaveProperty('value', 'euw');
    expect(screen.getByRole('option', { name: 'KR – Korea' })).toBeDefined();
  });

  it('opens the profile page of the player', async () => {
    renderPage('/');
    const user = userEvent.setup();

    await user.selectOptions(regionField(), 'kr');
    await search('  Hide on bush#KR1 ');

    expect(
      screen.getByRole('heading', { name: 'Hide on bush#KR1' }),
    ).toBeDefined();
    expect(screen.getByText('Korea')).toBeDefined();
  });

  it('keeps characters that have a meaning in URLs', async () => {
    renderPage('/');

    await search('100% sure?#EUW');

    expect(
      screen.getByRole('heading', { name: '100% sure?#EUW' }),
    ).toBeDefined();
  });

  it.each([
    ['nothing', '', 'Enter a Riot ID, e.g. Hide on bush#KR1'],
    ['no tag', 'Hide on bush', 'Add the tag after a #, e.g. Hide on bush#KR1'],
    [
      'a name too short',
      'ab#EUW',
      'Game name: must be 3 to 16 characters long',
    ],
  ])(
    'reports %s without sending any request to the API',
    async (_case, riotId, error) => {
      renderPage('/');
      const requests = recordRequests();

      await search(riotId);

      expect(screen.getByRole('alert')).toHaveProperty('textContent', error);
      // Still on the home page, and no request but the status check.
      expect(
        screen.getByRole('heading', { name: 'League of Legends stats' }),
      ).toBeDefined();
      expect(requests.filter((path) => path !== '/api/health')).toEqual([]);
    },
  );

  it('links the error to the field, and removes it once the field changes', async () => {
    renderPage('/');

    const user = await search('Hide on bush');

    const field = riotIdField();
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe(
      screen.getByRole('alert').id,
    );

    await user.type(field, '#KR1');

    expect(screen.queryByRole('alert')).toBeNull();
    expect(field.getAttribute('aria-invalid')).toBe('false');
  });
});
