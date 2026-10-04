import { screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from './test-server.ts';
import { renderPage } from './test-utils.tsx';

describe('home page', () => {
  it('shows that the API is up', async () => {
    server.use(
      http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),
    );

    renderPage('/');

    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    expect(await screen.findByText('API up')).toBeDefined();
  });

  it('says so while the API has not answered yet', async () => {
    server.use(http.get('/api/health', () => delay('infinite')));

    renderPage('/');

    expect(await screen.findByText('Checking the API…')).toBeDefined();
  });

  it.each([
    // What the Vite proxy answers when the API is not running.
    ['is not running', () => new HttpResponse(null, { status: 502 })],
    ['answers with an error', () => new HttpResponse(null, { status: 500 })],
    ['cannot be reached', () => HttpResponse.error()],
    ['answers something unexpected', () => HttpResponse.json({ status: 'ko' })],
  ])('shows that the API is unreachable when it %s', async (_case, answer) => {
    server.use(http.get('/api/health', answer));

    renderPage('/');

    expect(await screen.findByText('API unreachable')).toBeDefined();
  });
});

describe("Riot's legal notice", () => {
  it.each([
    ['the home page', '/'],
    ['the "not found" page', '/no/such/page'],
  ])('is on %s', (_case, path) => {
    server.use(
      http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),
    );

    renderPage(path);

    // Word for word, as Riot's policies require.
    expect(screen.getByRole('contentinfo').textContent).toBe(
      "statslol isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.",
    );
  });
});

describe('unknown address', () => {
  it('shows a "not found" page with a link to the home page', () => {
    renderPage('/no/such/page');

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Back to the home page' }),
    ).toHaveProperty('pathname', '/');
  });
});
