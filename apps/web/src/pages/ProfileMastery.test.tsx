import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { failure, mockPlayerApi } from '../test-api.ts';
import {
  championRecord,
  CURRENT_SEASON,
  MASTERY,
  PLAYER_PAGE_PATH,
} from '../test-data.ts';
import { recordRequests } from '../test-server.ts';
import { at, renderPage } from '../test-utils.tsx';

const MASTERY_PATH = `${PLAYER_PAGE_PATH}/mastery`;

/** The cards of the champions, once the list is there. */
async function cards(): Promise<HTMLElement[]> {
  // The first render of a file is the slowest (the whole app is loaded): more than the 1 s of
  // the default when the machine is busy.
  const list = await screen.findByRole(
    'list',
    { name: 'Champion mastery' },
    { timeout: 5000 },
  );
  return within(list).getAllByRole('listitem');
}

/** The first three cards (there are 3 champions in the fixture). */
async function threeCards(): Promise<[HTMLElement, HTMLElement, HTMLElement]> {
  const found = await cards();
  return [at(found, 0), at(found, 1), at(found, 2)];
}

/** The name of each card. */
async function names(): Promise<(string | null)[]> {
  return (await cards()).map(
    (card) => card.querySelector('[class*="name"]')?.textContent ?? null,
  );
}

describe('the Mastery tab', () => {
  it('has a card for each champion, the most points first, with its level, points and last game', async () => {
    mockPlayerApi();

    renderPage(MASTERY_PATH);

    // A champion unknown to Data Dragon keeps a name made of its ID.
    expect(await names()).toEqual(['Sylas', 'Wukong', 'Champion 9999']);
    const [sylas, wukong, other] = await threeCards();
    expect(within(sylas).getByText('324,704')).toBeDefined();
    expect(within(wukong).getByText('70,000')).toBeDefined();
    expect(within(other).getByText('5,296')).toBeDefined();
    // The date is relative to the moment the data arrived: the tests do not freeze time, so
    // only its shape is checked.
    expect(within(sylas).getByText(/^\d+d ago$/)).toBeDefined();
    expect(within(other).getByText('–')).toBeDefined();
  });

  it('shows what the player did with each champion in the season, from the games stored', async () => {
    mockPlayerApi();

    renderPage(MASTERY_PATH);

    const [sylas, wukong, other] = await threeCards();
    // Sylas: 4 games in 2 modes (Arena left out), 2 won. Wukong: 2 games, both won.
    await within(sylas).findByText(/^Season 16 - 4 games/);
    // Two lines: the season, the games and the KDA; then the win rate and what it comes from.
    const lines = (card: HTMLElement) =>
      [...card.querySelectorAll('[class*="season"] p')].map(
        (line) => line.textContent,
      );
    expect(lines(sylas)).toEqual([
      'Season 16 - 4 games - 3.33 KDA',
      'Winrate : 50% - 2W/2L',
    ]);
    expect(lines(wukong)).toEqual([
      'Season 16 - 2 games - 6.67 KDA',
      'Winrate : 100% - 2W/0L',
    ]);
    expect(within(other).getByText('No game in Season 16')).toBeDefined();
  });

  it('colours the win rate: blue from half of the games won, orange under', async () => {
    mockPlayerApi({
      champions: () =>
        HttpResponse.json({
          season: CURRENT_SEASON.id,
          records: [
            championRecord({ championId: 517, games: 4, wins: 1 }),
            championRecord({ championId: 62, games: 2, wins: 1 }),
          ],
        }),
    });

    renderPage(MASTERY_PATH);

    const [sylas, wukong] = await threeCards();
    const rate = async (card: HTMLElement, text: string) =>
      (await within(card).findByText(text)).className;
    expect(await rate(sylas, '25%')).toMatch(/rateLost/);
    expect(await rate(wukong, '50%')).toMatch(/rateWon/);
  });

  it('shows the cards without the season when its statistics cannot be had', async () => {
    mockPlayerApi({ champions: failure });

    renderPage(MASTERY_PATH);

    expect(await names()).toHaveLength(3);
    expect(screen.queryByText(/No game in/)).toBeNull();
    expect(screen.queryByText(/Season 16 - /)).toBeNull();
  });

  it('only reads the season: it does not start its loading', async () => {
    mockPlayerApi();
    const requests = recordRequests();

    renderPage(MASTERY_PATH);
    await cards();

    expect(requests.filter((path) => path.endsWith('/sync'))).toEqual([]);
  });

  it('shows the totals', async () => {
    mockPlayerApi();

    renderPage(MASTERY_PATH);

    await cards();
    expect(screen.getByText('52')).toBeDefined();
    expect(screen.getByText('mastery score')).toBeDefined();
    expect(screen.getByText('400,000')).toBeDefined();
    expect(
      screen.getByText('champions').previousElementSibling?.textContent,
    ).toBe('3');
  });

  it('shows the emblem of the level between the icon and the name, the one of level 10 past it', async () => {
    mockPlayerApi();

    renderPage(MASTERY_PATH);

    await cards();
    const list = screen.getByRole('list', { name: 'Champion mastery' });
    const emblems = within(list).getAllByRole('img', {
      name: /^Mastery level/,
    });
    expect(emblems.map((emblem) => emblem.getAttribute('alt'))).toEqual([
      'Mastery level 32',
      'Mastery level 12',
      'Mastery level 8',
    ]);
    // Past level 10 the emblem is the one of level 10; below it, the one of the level.
    const [past, alsoPast, eight] = emblems.map((emblem) =>
      emblem.getAttribute('src'),
    );
    expect(past).toBe(alsoPast);
    expect(eight).not.toBe(past);
    // In the first card: the icon of the champion, then the emblem, side by side...
    const card = within(list).getAllByRole('listitem')[0];
    const top = card?.firstElementChild;
    expect(
      [...(top?.querySelectorAll('img') ?? [])].map((image) =>
        image.getAttribute('alt'),
      ),
    ).toEqual(['Sylas', 'Mastery level 32']);
    // ... and on their right the name, the points and the last game.
    const info = top?.lastElementChild;
    expect([...(info?.children ?? [])].map((line) => line.textContent)).toEqual(
      ['Sylas', '324,704', expect.stringMatching(/ago$/) as string],
    );
  });

  it('has no column for the next level any more', async () => {
    mockPlayerApi();

    renderPage(MASTERY_PATH);

    await cards();
    expect(screen.queryByText('Next level')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/to go/)).toBeNull();
  });

  it('is in the bar between Champions and Arena, marked when open', async () => {
    mockPlayerApi();

    renderPage(MASTERY_PATH);

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
      ['Mastery', 'page'],
      ['Arena', null],
    ]);
  });

  it('searches a champion by the name the page shows', async () => {
    mockPlayerApi();
    const user = userEvent.setup();
    renderPage(MASTERY_PATH);
    await cards();

    await user.type(screen.getByRole('searchbox'), 'wuk');

    expect(await names()).toEqual(['Wukong']);
  });

  it('says so when no champion fits the search', async () => {
    mockPlayerApi();
    const user = userEvent.setup();
    renderPage(MASTERY_PATH);
    await cards();

    await user.type(screen.getByRole('searchbox'), 'nobody');

    expect(
      await screen.findByText('No champion matches this search.'),
    ).toBeDefined();
  });

  it('lists the first 30 champions, and the others when asked', async () => {
    const champions = Array.from({ length: 45 }, (_, index) => ({
      ...MASTERY.champions[0],
      championId: 1000 + index,
      points: 100_000 - index,
    }));
    mockPlayerApi({
      mastery: () =>
        HttpResponse.json({ score: 45, totalPoints: 4_000_000, champions }),
    });
    const user = userEvent.setup();
    renderPage(MASTERY_PATH);

    expect(await cards()).toHaveLength(30);
    await user.click(
      screen.getByRole('button', { name: 'Show all 45 champions' }),
    );

    expect(await cards()).toHaveLength(45);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('says so for a player with no mastery', async () => {
    mockPlayerApi({
      mastery: () =>
        HttpResponse.json({ score: 0, totalPoints: 0, champions: [] }),
    });

    renderPage(MASTERY_PATH);

    expect(
      await screen.findByText('This player has no champion mastery.'),
    ).toBeDefined();
  });

  it('shows the error, and tries again', async () => {
    let failing = true;
    mockPlayerApi({
      mastery: (info) => (failing ? failure(info) : HttpResponse.json(MASTERY)),
    });
    const user = userEvent.setup();
    renderPage(MASTERY_PATH);

    await screen.findByText('The mastery could not be loaded.');
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await cards()).toHaveLength(3);
  });

  it('is asked once for the page (the overview shares the answer)', async () => {
    mockPlayerApi();
    const requests = recordRequests();

    renderPage(MASTERY_PATH);
    await cards();

    expect(requests.filter((path) => path.endsWith('/mastery'))).toHaveLength(
      1,
    );
  });
});

describe('the top mastery of the overview', () => {
  it('shows the 3 champions with the most points, with a link to the whole list', async () => {
    mockPlayerApi();

    renderPage(PLAYER_PAGE_PATH);

    const box = await screen.findByRole('region', { name: 'Top mastery' });
    await within(box).findByText('Sylas');
    expect(
      within(box)
        .getAllByRole('group')
        .map((group) => group.textContent),
    ).toEqual([
      '32Sylas324,704 points',
      '12Wukong70,000 points',
      '8Champion 99995,296 points',
    ]);
    expect(
      within(box)
        .getByRole('link', { name: 'All champions' })
        .getAttribute('href'),
    ).toBe(`${PLAYER_PAGE_PATH}/mastery`);
  });

  it('shows nothing when the mastery cannot be had, the rest of the page staying', async () => {
    mockPlayerApi({ mastery: failure });

    renderPage(PLAYER_PAGE_PATH);

    await screen.findByText('Last 2 games');
    expect(screen.queryByRole('region', { name: 'Top mastery' })).toBeNull();
  });

  it('shows nothing for a player with no mastery', async () => {
    mockPlayerApi({
      mastery: () =>
        HttpResponse.json({ score: 0, totalPoints: 0, champions: [] }),
    });

    renderPage(PLAYER_PAGE_PATH);

    await screen.findByText('Last 2 games');
    expect(screen.queryByRole('region', { name: 'Top mastery' })).toBeNull();
  });
});
