import type { MatchSummary } from '@statslol/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { delay } from 'msw';
import { describe, expect, it } from 'vitest';

import { failure, matchPages, mockPlayerApi } from '../test-api.ts';
import { matchSummary, PLAYER_PAGE_PATH } from '../test-data.ts';
import { at, renderPage } from '../test-utils.tsx';

/** A game of `result` with Sylas (517), unless the champion is given. */
function game(
  id: string,
  result: 'win' | 'loss' | 'remake',
  score: [number, number, number],
  champion: 'Sylas' | 'Wukong' = 'Sylas',
): MatchSummary {
  const [kills, deaths, assists] = score;
  return matchSummary(id, {
    result,
    kills,
    deaths,
    assists,
    ...(champion === 'Wukong'
      ? { championId: 62, championName: 'MonkeyKing' }
      : {}),
  });
}

/** 4 games: Sylas won 2 of 3, Wukong lost his only one. */
const GAMES = [
  game('KR_4', 'win', [10, 2, 8], 'Sylas'),
  game('KR_3', 'win', [4, 4, 6], 'Sylas'),
  game('KR_2', 'loss', [1, 6, 1], 'Sylas'),
  game('KR_1', 'loss', [5, 0, 5], 'Wukong'),
];

async function findSummary() {
  return screen.findByText('Last 4 games');
}

describe('summary of the last games', () => {
  it('shows the win rate as a ring, with the record inside', async () => {
    mockPlayerApi({
      matches: matchPages({ 0: { matches: GAMES, nextStart: null } }),
    });

    renderPage(PLAYER_PAGE_PATH);

    await findSummary();
    const ring = screen.getByRole('img', {
      name: 'Win rate: 50%, 2 wins and 2 losses',
    });
    expect(ring.textContent).toBe('50%2W - 2L');
    // The arc of the wins: half of the circle (radius 42), the rest of it is the losses.
    const [losses, wins] = [...ring.querySelectorAll('circle')];
    expect(losses?.getAttribute('stroke-dasharray')).toBeNull();
    expect(wins?.getAttribute('stroke-dasharray')).toMatch(
      /^131\.9\d* 263\.8\d*$/,
    );
  });

  it('draws the share of the wins: three quarters of the circle for 3 wins in 4', async () => {
    mockPlayerApi({
      matches: matchPages({
        0: {
          matches: [
            game('KR_4', 'win', [1, 1, 1]),
            game('KR_3', 'win', [1, 1, 1]),
            game('KR_2', 'win', [1, 1, 1]),
            game('KR_1', 'loss', [1, 1, 1]),
          ],
          nextStart: null,
        },
      }),
    });

    renderPage(PLAYER_PAGE_PATH);

    await findSummary();
    const ring = screen.getByRole('img', {
      name: 'Win rate: 75%, 3 wins and 1 loss',
    });
    expect(
      ring.querySelectorAll('circle')[1]?.getAttribute('stroke-dasharray'),
    ).toMatch(/^197\.9\d* 263\.8\d*$/);
  });

  it('draws only the wins of a player who won everything, and only the losses of one who lost', async () => {
    mockPlayerApi({
      matches: matchPages({
        0: { matches: [game('KR_1', 'win', [1, 1, 1])], nextStart: null },
      }),
    });
    const { unmount } = renderPage(PLAYER_PAGE_PATH);
    await screen.findByText('Last 1 games');
    const ring = screen.getByRole('img', { name: /^Win rate: 100%/ });
    expect(ring.querySelectorAll('circle')).toHaveLength(2);
    expect(
      ring.querySelectorAll('circle')[1]?.getAttribute('stroke-dasharray'),
    ).toMatch(/^263\.8\d* 263\.8\d*$/);
    unmount();

    mockPlayerApi({
      matches: matchPages({
        0: { matches: [game('KR_2', 'loss', [1, 1, 1])], nextStart: null },
      }),
    });
    renderPage(PLAYER_PAGE_PATH);
    await screen.findByText('Last 1 games');
    expect(
      screen
        .getByRole('img', { name: /^Win rate: 0%/ })
        .querySelectorAll('circle'),
    ).toHaveLength(1);
  });

  it('shows the average KDA, and under it the average kills, deaths and assists', async () => {
    mockPlayerApi({
      matches: matchPages({ 0: { matches: GAMES, nextStart: null } }),
    });

    renderPage(PLAYER_PAGE_PATH);

    await findSummary();
    // 20 kills, 12 deaths, 20 assists in 4 games.
    expect(screen.getAllByText('3.33').length).toBeGreaterThan(0);
    const average = screen.getByText('5.0 / 3.0 / 5.0');
    expect(average.textContent).toBe(
      'Average kills, deaths, assists: 5.0 / 3.0 / 5.0',
    );
  });

  it('lists the most played champions with record, win rate and average score', async () => {
    mockPlayerApi({
      matches: matchPages({ 0: { matches: GAMES, nextStart: null } }),
    });

    renderPage(PLAYER_PAGE_PATH);

    await findSummary();
    const champions = screen.getByRole('group', {
      name: 'Most played champions',
    });
    const sylas = at([...champions.children] as HTMLElement[], 0);
    const wukong = at([...champions.children] as HTMLElement[], 1);
    // The name is not written: the image says it. Under the win rate, only the KDA.
    expect(within(sylas).getByRole('img', { name: 'Sylas' })).toBeDefined();
    expect(within(sylas).queryByText('Sylas')).toBeNull();
    // Sylas: 3 games, 2 wins; (15 kills + 15 assists) / 12 deaths.
    expect(sylas.textContent).toBe('67% - 2W/1L2.50 KDA');
    expect(within(wukong).getByRole('img', { name: 'Wukong' })).toBeDefined();
    expect(wukong.textContent).toBe('0% - 0W/1LPerfect KDA');
    expect(champions.children).toHaveLength(2);
  });

  it('shows the average rank of the player, a placeholder until the factors are chosen', async () => {
    mockPlayerApi({
      matches: matchPages({ 0: { matches: GAMES, nextStart: null } }),
    });

    renderPage(PLAYER_PAGE_PATH);

    await findSummary();
    expect(screen.getByText('5/10')).toBeDefined();
    expect(screen.getByText('Average rank')).toBeDefined();
  });

  it('shows the images of the champions from Data Dragon', async () => {
    mockPlayerApi({
      matches: matchPages({ 0: { matches: GAMES, nextStart: null } }),
    });

    renderPage(PLAYER_PAGE_PATH);

    await findSummary();
    const champions = screen.getByRole('group', {
      name: 'Most played champions',
    });
    expect(
      [...champions.querySelectorAll('img')].map((image) =>
        image.getAttribute('src'),
      ),
    ).toEqual([
      'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/champion/Sylas.png',
      'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/champion/MonkeyKing.png',
    ]);
  });

  it('counts the first 20 games of the 2 pages it loads by itself, and leaves out a remake', async () => {
    const page = (prefix: string, count: number, result: 'win' | 'loss') =>
      Array.from({ length: count }, (_, index) =>
        game(`${prefix}${String(index)}`, result, [1, 1, 1]),
      );
    mockPlayerApi({
      matches: matchPages({
        0: {
          matches: [
            game('remake', 'remake', [0, 0, 0]),
            ...page('a', 9, 'win'),
          ],
          nextStart: 10,
        },
        10: { matches: page('b', 10, 'loss'), nextStart: 20 },
        20: { matches: page('c', 10, 'win'), nextStart: null },
      }),
    });

    renderPage(PLAYER_PAGE_PATH);

    // 9 wins and 10 losses on the first 2 pages: the 3rd page is not loaded, it would not count.
    await screen.findByText('Last 19 games');
    expect(
      screen.getByRole('img', { name: 'Win rate: 47%, 9 wins and 10 losses' }),
    ).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
  });

  it('shows a grey block until the second page has come, then the summary', async () => {
    let release: () => void = () => undefined;
    const second = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockPlayerApi({
      matches: ({ request }) => {
        const start = Number(new URL(request.url).searchParams.get('start'));
        if (start === 0) {
          return Response.json({ matches: [GAMES[0]], nextStart: 1 });
        }
        return second.then(() =>
          Response.json({ matches: [GAMES[1]], nextStart: null }),
        );
      },
    });

    const { container } = renderPage(PLAYER_PAGE_PATH);

    await screen.findByRole('list');
    expect(screen.queryByText(/^Last \d+ games$/)).toBeNull();
    expect(
      container.querySelector('[aria-hidden="true"].skeleton'),
    ).not.toBeNull();
    release();
    expect(await screen.findByText('Last 2 games')).toBeDefined();
  });

  it('is there from the first page when the second one cannot be loaded', async () => {
    mockPlayerApi({
      matches: ({ request }) => {
        const start = Number(new URL(request.url).searchParams.get('start'));
        return start === 0
          ? Response.json({ matches: GAMES, nextStart: 4 })
          : failure({ request } as never);
      },
    });

    renderPage(PLAYER_PAGE_PATH);

    expect(await findSummary()).toBeDefined();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
  });

  it.each([
    ['no match', []],
    ['nothing but remakes', [game('KR_1', 'remake', [0, 0, 0])]],
  ])('shows no summary for %s', async (_case, matches) => {
    mockPlayerApi({
      matches: matchPages({ 0: { matches, nextStart: null } }),
    });

    renderPage(PLAYER_PAGE_PATH);

    await waitFor(() => {
      expect(screen.queryByText('Loading the matches…')).toBeNull();
    });
    expect(screen.queryByText(/^Last \d+ games$/)).toBeNull();
    expect(
      screen.queryByRole('group', { name: 'Most played champions' }),
    ).toBeNull();
  });

  it('keeps the title for screen readers', () => {
    mockPlayerApi({ matches: () => delay('infinite') });

    renderPage(PLAYER_PAGE_PATH);

    const title = screen.getByRole('heading', { name: 'Match history' });
    expect(title.className).toContain('visually-hidden');
  });
});
