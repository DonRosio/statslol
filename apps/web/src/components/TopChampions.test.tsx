import { screen, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { failure, mockPlayerApi } from '../test-api.ts';
import {
  championRecord,
  CHAMPION_RECORDS,
  CURRENT_SEASON,
  PLAYER_PAGE_PATH,
} from '../test-data.ts';
import { renderPage } from '../test-utils.tsx';

describe('the top champions of the overview', () => {
  it('shows the champions played the most in the season: games, win rate and KDA', async () => {
    mockPlayerApi();

    renderPage(PLAYER_PAGE_PATH);

    const box = await screen.findByRole('region', {
      name: /^Top played champions/,
    });
    await within(box).findByText('4 games');
    expect(box.textContent).toContain(CURRENT_SEASON.label);
    // Sylas: 4 games (Arena left out), 2 won; Wukong: 2 games, both won. No name written: the
    // icon says who it is. The KDA and its detail, then the win rate and the games.
    expect(
      within(box)
        .getAllByRole('group')
        .map((group) => group.textContent),
    ).toEqual([
      '3.33 KDA4.8 / 3.8 / 7.850% - 2W/2L4 games',
      '6.67 KDA6.0 / 1.5 / 4.0100% - 2W/0L2 games',
    ]);
    expect(within(box).getByRole('img', { name: 'Sylas' })).toBeDefined();
    expect(within(box).queryByText('Sylas')).toBeNull();
    expect(
      within(box)
        .getByRole('link', { name: 'All champions' })
        .getAttribute('href'),
    ).toBe(`${PLAYER_PAGE_PATH}/champions`);
  });

  it('colours the win rate with the scale: red low, grey at half, blue high', async () => {
    mockPlayerApi({
      champions: () =>
        HttpResponse.json({
          season: CURRENT_SEASON.id,
          records: [championRecord({ games: 4, wins: 1 })],
        }),
    });

    renderPage(PLAYER_PAGE_PATH);

    const box = await screen.findByRole('region', {
      name: /^Top played champions/,
    });
    const rate = await within(box).findByText('25%');
    expect(rate.style.getPropertyValue('--win-rate-color')).toBe(
      'var(--color-rate-low)',
    );
  });

  it('shows 5 champions at most, the most played first', async () => {
    mockPlayerApi({
      champions: () =>
        HttpResponse.json({
          season: CURRENT_SEASON.id,
          records: [
            ...CHAMPION_RECORDS,
            championRecord({ championId: 1, championName: 'Annie', games: 9 }),
            championRecord({ championId: 2, championName: 'Olaf', games: 1 }),
            championRecord({ championId: 3, championName: 'Zed', games: 3 }),
            championRecord({ championId: 4, championName: 'Ahri', games: 2 }),
            championRecord({ championId: 5, championName: 'Lux', games: 1 }),
          ],
        }),
    });

    renderPage(PLAYER_PAGE_PATH);

    const box = await screen.findByRole('region', {
      name: /^Top played champions/,
    });
    await within(box).findByText('9 games');
    const groups = within(box).getAllByRole('group');
    expect(groups).toHaveLength(5);
    // 9, 4 (Sylas), 3 (Zed), 2 (Wukong, then Ahri: the one that won the most first), ...
    expect(
      groups.map(
        (group) => group.lastElementChild?.lastElementChild?.textContent,
      ),
    ).toEqual(['9 games', '4 games', '3 games', '2 games', '2 games']);
  });

  it('shows nothing when the statistics cannot be had, the rest of the page staying', async () => {
    mockPlayerApi({ champions: failure });

    renderPage(PLAYER_PAGE_PATH);

    await screen.findByText('Last 2 games');
    expect(
      screen.queryByRole('region', { name: /^Top played champions/ }),
    ).toBeNull();
  });

  it('shows nothing when no game is stored', async () => {
    mockPlayerApi({
      champions: () =>
        HttpResponse.json({ season: CURRENT_SEASON.id, records: [] }),
    });

    renderPage(PLAYER_PAGE_PATH);

    await screen.findByText('Last 2 games');
    expect(
      screen.queryByRole('region', { name: /^Top played champions/ }),
    ).toBeNull();
  });

  it('shows nothing for games of Arena only', async () => {
    mockPlayerApi({
      champions: () =>
        HttpResponse.json({
          season: CURRENT_SEASON.id,
          records: [championRecord({ queueId: 1700, position: null })],
        }),
    });

    renderPage(PLAYER_PAGE_PATH);

    await screen.findByText('Last 2 games');
    expect(
      screen.queryByRole('region', { name: /^Top played champions/ }),
    ).toBeNull();
  });
});
