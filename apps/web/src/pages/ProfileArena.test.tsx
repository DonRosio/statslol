import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { matchPages, mockPlayerApi } from '../test-api.ts';
import {
  ARAM_MATCH,
  ARENA_MATCH,
  matchSummary,
  PLAYER_PAGE_PATH,
} from '../test-data.ts';
import { recordRequests } from '../test-server.ts';
import { renderPage } from '../test-utils.tsx';

const ARENA_PATH = `${PLAYER_PAGE_PATH}/arena`;

/** Everything the player did: 2 Arena games, a ranked game and an ARAM game. */
const MIXED = [
  matchSummary('KR_4', { queueId: 1750, placement: 2 }),
  matchSummary('KR_3'),
  { ...ARENA_MATCH, id: 'KR_2' },
  { ...ARAM_MATCH, id: 'KR_1' },
];

function listedGames() {
  return screen
    .getAllByRole('listitem')
    .map((game) => within(game).getByText(/Arena|Solo\/Duo|ARAM/).textContent);
}

describe('Arena games', () => {
  it('are left out of the overview, which keeps the other games', async () => {
    mockPlayerApi({
      matches: matchPages({ 0: { matches: MIXED, nextStart: null } }),
    });

    renderPage(PLAYER_PAGE_PATH);

    await screen.findByText('Last 2 games');
    expect(listedGames()).toEqual(['Solo/Duo', 'ARAM']);
  });

  it('are in their own tab, which has nothing else', async () => {
    mockPlayerApi({
      matches: matchPages({ 0: { matches: MIXED, nextStart: null } }),
    });

    renderPage(ARENA_PATH);

    await screen.findByRole('heading', { name: 'Arena match history' });
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });
    expect(listedGames()).toEqual(['Arena', 'Arena']);
    // The summary and the ranks are those of the usual games.
    expect(screen.queryByText(/^Last \d+ games$/)).toBeNull();
    expect(screen.queryByText('Ranked Solo/Duo')).toBeNull();
  });

  it('give their tab a place in the bar, marked when it is open', async () => {
    mockPlayerApi();

    renderPage(ARENA_PATH);

    const bar = await screen.findByRole('navigation', {
      name: 'Profile sections',
    });
    expect(
      within(bar)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('aria-current')]),
    ).toEqual([
      ['Overview', null],
      ['Champions', null],
      ['Arena', 'page'],
    ]);
  });

  it('say so in their tab when the player has none', async () => {
    mockPlayerApi({
      matches: matchPages({
        0: { matches: [matchSummary('KR_3')], nextStart: null },
      }),
    });

    renderPage(ARENA_PATH);

    expect(await screen.findByText('No Arena games yet.')).toBeDefined();
  });

  it('are looked for in the next pages, when the first one has none', async () => {
    // 3 pages: only the third one has an Arena game.
    mockPlayerApi({
      matches: matchPages({
        0: { matches: [matchSummary('KR_5')], nextStart: 1 },
        1: { matches: [matchSummary('KR_4')], nextStart: 2 },
        2: {
          matches: [matchSummary('KR_3', { queueId: 1700, placement: 1 })],
          nextStart: null,
        },
      }),
    });
    const requests = recordRequests();

    renderPage(ARENA_PATH);

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });
    expect(requests.filter((path) => path.endsWith('/matches'))).toHaveLength(
      3,
    );
  });

  it('do not hide the usual games of a player who mostly plays Arena: more pages are loaded, up to 5', async () => {
    // Each page: 2 Arena games and 1 other.
    const pages = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [
        index,
        {
          matches: [
            matchSummary(`KR_A${String(index)}`, {
              queueId: 1750,
              placement: 2,
            }),
            matchSummary(`KR_B${String(index)}`, {
              queueId: 1750,
              placement: 4,
            }),
            matchSummary(`KR_C${String(index)}`),
          ],
          nextStart: index < 7 ? index + 1 : null,
        },
      ]),
    );
    mockPlayerApi({ matches: matchPages(pages) });

    renderPage(PLAYER_PAGE_PATH);

    // 5 pages, not more: 1 game of the overview in each.
    await screen.findByText('Last 5 games', {}, { timeout: 4000 });
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Show more' })).toBeDefined();
  });
});
