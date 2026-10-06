import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { delay } from 'msw';
import { describe, expect, it } from 'vitest';

import { failure, matchPages, mockPlayerApi } from '../test-api.ts';
import { matchSummary, PLAYER_PAGE_PATH } from '../test-data.ts';
import { recordRequests } from '../test-server.ts';
import { at, findMatches, renderPage } from '../test-utils.tsx';

/** The images of the game, from Data Dragon (the icons of the positions are the site's own). */
function imageSources() {
  return [...document.querySelectorAll('img')]
    .map((image) => image.src)
    .filter((source) => source.startsWith('https://ddragon.'));
}

const SYLAS =
  'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/champion/Sylas.png';
const MONKEY_KING =
  'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/champion/MonkeyKing.png';
// The profile icon, then the 2 champions of the top mastery (a third one is not in Data
// Dragon), the 2 of the summary, and the 2 of the matches.
const IMAGE_SOURCES = [
  'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/profileicon/6.png',
  SYLAS,
  MONKEY_KING,
  SYLAS,
  MONKEY_KING,
  SYLAS,
  MONKEY_KING,
];

describe('profile page', () => {
  it('shows whose profile it is before the API answers', () => {
    mockPlayerApi({
      profile: () => delay('infinite'),
      matches: () => delay('infinite'),
    });

    renderPage(PLAYER_PAGE_PATH);

    expect(
      screen.getByRole('heading', { name: 'Hide on bush#KR1' }),
    ).toBeDefined();
    expect(screen.getByText('Korea')).toBeDefined();
    expect(screen.getByText('Loading the profile…')).toBeDefined();
    expect(screen.getByText('Loading the matches…')).toBeDefined();
  });

  it('shows the level, the ranks, and the Riot ID the way its owner writes it', async () => {
    mockPlayerApi();

    renderPage('/players/kr/hide%20on%20bush/kr1');

    expect(await screen.findByText('Korea · Level 812')).toBeDefined();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hide on bush#KR1' }),
    ).toBeDefined();
    const solo = screen.getByRole('region', { name: 'Ranked Solo/Duo' });
    expect(within(solo).getByText('Challenger · 1342 LP')).toBeDefined();
    expect(within(solo).getByText('120W 80L · 60% win rate')).toBeDefined();
    const flex = screen.getByRole('region', { name: 'Ranked Flex' });
    expect(within(flex).getByText('Unranked')).toBeDefined();
  });

  it('asks the API about the player of the URL, percent-encoded', async () => {
    mockPlayerApi();
    const requests = recordRequests();

    renderPage('/players/euw/100%25%20sure%3F/EUW');

    await findMatches();
    expect(requests.toSorted()).toEqual([
      '/api/v1/players/euw/100%25%20sure%3F/EUW',
      '/api/v1/players/euw/100%25%20sure%3F/EUW/mastery',
      '/api/v1/players/euw/100%25%20sure%3F/EUW/matches',
      '/api/v1/static-data',
    ]);
  });

  it('lists the matches of the player, from their point of view', async () => {
    mockPlayerApi();

    renderPage(PLAYER_PAGE_PATH);

    const matches = await findMatches();
    const ranked = at(matches, 0);
    const aram = at(matches, 1);
    expect(matches).toHaveLength(2);
    expect(ranked.getAttribute('data-result')).toBe('win');
    for (const text of [
      'Victory',
      'Solo/Duo',
      'Lvl. 16',
      '8.00 KDA',
      '192 CS (6.3)',
    ]) {
      expect(within(ranked).getByText(text)).toBeDefined();
    }
    expect(within(ranked).getByText(/· 30:34$/)).toBeDefined();
    // The champion and the position are drawn, not written: the images say what they are.
    expect(within(ranked).getByRole('img', { name: 'Sylas' })).toBeDefined();
    expect(within(ranked).getByRole('img', { name: 'Mid' })).toBeDefined();
    // No written name: only the images (and the tooltip of the drawing) have one.
    expect(within(ranked).queryByText('Sylas')).toBeNull();
    expect(
      within(ranked).queryByText('Mid', { selector: 'p, span' }),
    ).toBeNull();
    // Screen readers say what the numbers are.
    expect(
      within(ranked).getByText('Kills, deaths, assists:').parentElement
        ?.textContent,
    ).toBe('Kills, deaths, assists: 7 / 2 / 9');
    expect(
      within(ranked)
        .getByText(/\d+(d|h| min) ago$/)
        .getAttribute('datetime'),
    ).toBe('2026-10-03T16:41:12.000Z');
    // An ARAM game: the name players know, and no position.
    for (const text of ['ARAM', 'Perfect KDA']) {
      expect(within(aram).getByText(text)).toBeDefined();
    }
    expect(within(aram).getByRole('img', { name: 'Wukong' })).toBeDefined();
    expect(within(aram).queryByRole('img', { name: 'Mid' })).toBeNull();
  });

  it('shows the profile icon and the champions from Data Dragon', async () => {
    mockPlayerApi();

    renderPage(PLAYER_PAGE_PATH);

    await waitFor(() => {
      expect(imageSources()).toEqual(IMAGE_SOURCES);
    });
  });

  it('shows an empty square instead of an image that fails to load', async () => {
    mockPlayerApi();

    renderPage(PLAYER_PAGE_PATH);

    await waitFor(() => {
      expect(imageSources()).toEqual(IMAGE_SOURCES);
    });
    const icon = at([...document.querySelectorAll('img')], 0);
    fireEvent.error(icon);

    expect(icon.isConnected).toBe(false);
    expect(imageSources()).toEqual(IMAGE_SOURCES.slice(1));
  });

  it('shows names instead of images without the static data', async () => {
    mockPlayerApi({ staticData: failure });
    const requests = recordRequests();

    renderPage(PLAYER_PAGE_PATH);

    const matches = await findMatches();
    await screen.findByText('Korea · Level 812');
    expect(requests).toContain('/api/v1/static-data');
    expect(
      within(at(matches, 1)).getByRole('img', { name: 'MonkeyKing' }),
    ).toBeDefined();
    expect(imageSources()).toEqual([]);
  });

  it("shows Riot's name of a champion Data Dragon does not know yet", async () => {
    mockPlayerApi({
      matches: matchPages({
        0: {
          matches: [
            matchSummary('KR_1', {
              championId: 999,
              championName: 'Newcomer',
              position: null,
            }),
          ],
          nextStart: null,
        },
      }),
    });

    renderPage(PLAYER_PAGE_PATH);

    const match = at(await findMatches(), 0);
    expect(within(match).getByRole('img', { name: 'Newcomer' })).toBeDefined();
    expect(match.querySelector('img')).toBeNull();
  });

  it('loads pages by itself, for the summary, up to 5 of them: the next ones are loaded with "Show more"', async () => {
    // A long history: one game in each of 7 pages.
    const pages = Object.fromEntries(
      Array.from({ length: 7 }, (_, index) => [
        index,
        {
          matches: [matchSummary(`KR_${String(7 - index)}`)],
          nextStart: index < 6 ? index + 1 : null,
        },
      ]),
    );
    mockPlayerApi({ matches: matchPages(pages) });
    renderPage(PLAYER_PAGE_PATH);

    // Without a click: 5 pages, not more (each new match is a call to Riot).
    await waitFor(
      () => {
        expect(screen.getAllByRole('listitem')).toHaveLength(5);
      },
      { timeout: 4000 },
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Show more' },
        { timeout: 4000 },
      ),
    );
    await waitFor(
      () => {
        expect(screen.getAllByRole('listitem')).toHaveLength(6);
      },
      { timeout: 4000 },
    );
    await user.click(screen.getByRole('button', { name: 'Show more' }));

    await waitFor(
      () => {
        expect(screen.getAllByRole('listitem')).toHaveLength(7);
      },
      { timeout: 4000 },
    );
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('says so when the player has no matches', async () => {
    mockPlayerApi({
      matches: matchPages({ 0: { matches: [], nextStart: null } }),
    });

    renderPage(PLAYER_PAGE_PATH);

    expect(await screen.findByText('No matches yet.')).toBeDefined();
  });

  it.each([
    ['an unknown region', '/players/xx/Hide%20on%20bush/KR1'],
    ['a name too short', '/players/euw/ab/EUW'],
    ['a forbidden character', '/players/euw/a%5Cb%5Cc/EUW'],
    ['a tag too long', '/players/euw/Hide%20on%20bush/EUW123'],
  ])('is "not found" for %s, without asking the API', (_case, path) => {
    const requests = recordRequests();

    renderPage(path);

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeDefined();
    expect(requests).toEqual([]);
  });
});
