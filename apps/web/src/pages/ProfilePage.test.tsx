import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { delay } from 'msw';
import { describe, expect, it } from 'vitest';

import { failure, matchPages, mockPlayerApi } from '../test-api.ts';
import { matchSummary, PLAYER_PAGE_PATH } from '../test-data.ts';
import { recordRequests } from '../test-server.ts';
import { at, findMatches, renderPage } from '../test-utils.tsx';

function imageSources() {
  return [...document.querySelectorAll('img')].map((image) => image.src);
}

const IMAGE_SOURCES = [
  'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/profileicon/6.png',
  'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/champion/Sylas.png',
  'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/champion/MonkeyKing.png',
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
      '/api/v1/players/euw/100%25%20sure%3F/EUW/matches',
      '/api/v1/static-data',
    ]);
  });

  it('lists the matches of the player, from their point of view', async () => {
    mockPlayerApi();

    renderPage(PLAYER_PAGE_PATH);

    const matches = await findMatches();
    const ranked = at(matches, 0);
    const arena = at(matches, 1);
    expect(matches).toHaveLength(2);
    expect(ranked.getAttribute('data-result')).toBe('win');
    for (const text of [
      'Victory',
      'Ranked Solo/Duo',
      'Sylas',
      'Mid',
      '7 / 2 / 9',
      '8.00 KDA',
      '192 CS (6.3/min)',
    ]) {
      expect(within(ranked).getByText(text)).toBeDefined();
    }
    expect(within(ranked).getByText(/· 30:34$/)).toBeDefined();
    // Screen readers say what the numbers are.
    expect(within(ranked).getByText('7 / 2 / 9').textContent).toBe(
      'Kills, deaths, assists: 7 / 2 / 9',
    );
    expect(
      within(ranked)
        .getByText(/ago$|^yesterday$/)
        .getAttribute('datetime'),
    ).toBe('2026-10-03T16:41:12.000Z');
    // In Arena: the place instead of "Victory", the name players know, and no position.
    for (const text of ['3rd place', 'Arena', 'Wukong', 'Perfect KDA']) {
      expect(within(arena).getByText(text)).toBeDefined();
    }
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
    expect(within(at(matches, 1)).getByText('MonkeyKing')).toBeDefined();
    expect(imageSources()).toEqual([]);
  });

  it("shows Riot's name of a champion Data Dragon does not know yet", async () => {
    mockPlayerApi({
      matches: matchPages({
        0: {
          matches: [
            matchSummary('KR_1', { championId: 999, championName: 'Newcomer' }),
          ],
          nextStart: null,
        },
      }),
    });

    renderPage(PLAYER_PAGE_PATH);

    const match = at(await findMatches(), 0);
    expect(within(match).getByText('Newcomer')).toBeDefined();
    expect(match.querySelector('img')).toBeNull();
  });

  it('loads older matches with "Show more", until the last page', async () => {
    mockPlayerApi({
      matches: matchPages({
        0: {
          matches: [matchSummary('KR_4'), matchSummary('KR_3')],
          nextStart: 2,
        },
        // KR_5 was played meanwhile: KR_3 comes again.
        2: {
          matches: [matchSummary('KR_3'), matchSummary('KR_2')],
          nextStart: null,
        },
      }),
    });
    renderPage(PLAYER_PAGE_PATH);
    expect(await findMatches()).toHaveLength(2);

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Show more' }));

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });
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
