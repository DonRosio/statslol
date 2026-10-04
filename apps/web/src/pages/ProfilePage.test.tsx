import type { MatchHistory } from '@statslol/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { delay, http, HttpResponse, type HttpResponseResolver } from 'msw';
import { describe, expect, it } from 'vitest';

import { recordRequests, server } from '../test-server.ts';
import {
  ARENA_MATCH,
  matchSummary,
  PLAYER_PAGE_PATH,
  PROFILE,
  STATIC_DATA,
} from '../test-data.ts';
import { renderPage } from '../test-utils.tsx';

/** Answers each page of matches by its `start`; any other page is an error. */
function matchPages(
  pages: Readonly<Record<number, MatchHistory>>,
): HttpResponseResolver {
  return ({ request }) => {
    const start = Number(new URL(request.url).searchParams.get('start'));
    const page = pages[start];
    return page === undefined
      ? new HttpResponse(null, { status: 500 })
      : HttpResponse.json(page);
  };
}

const ONE_PAGE = matchPages({
  0: { matches: [matchSummary('KR_3'), ARENA_MATCH], nextStart: null },
});

/** The fake API: by default, the profile, one page of 2 matches and the static data. */
function mockApi({
  profile = () => HttpResponse.json(PROFILE),
  matches = ONE_PAGE,
  staticData = () => HttpResponse.json(STATIC_DATA),
}: {
  profile?: HttpResponseResolver;
  matches?: HttpResponseResolver;
  staticData?: HttpResponseResolver;
} = {}) {
  server.use(
    http.get('/api/v1/players/:region/:name/:tag', profile),
    http.get('/api/v1/players/:region/:name/:tag/matches', matches),
    http.get('/api/v1/static-data', staticData),
  );
}

const failure = () => new HttpResponse(null, { status: 500 });

/** Waits for the list of matches, then returns its items. */
async function findMatches(): Promise<HTMLElement[]> {
  const list = await screen.findByRole('list');
  return within(list).getAllByRole('listitem');
}

/** The item at `index`, or a failed test if there is none. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`No item at index ${String(index)}`);
  }
  return item;
}

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
    mockApi({
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
    mockApi();

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
    mockApi();
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
    mockApi();

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
    mockApi();

    renderPage(PLAYER_PAGE_PATH);

    await waitFor(() => {
      expect(imageSources()).toEqual(IMAGE_SOURCES);
    });
  });

  it('shows an empty square instead of an image that fails to load', async () => {
    mockApi();

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
    mockApi({ staticData: failure });
    const requests = recordRequests();

    renderPage(PLAYER_PAGE_PATH);

    const matches = await findMatches();
    await screen.findByText('Korea · Level 812');
    expect(requests).toContain('/api/v1/static-data');
    expect(within(at(matches, 1)).getByText('MonkeyKing')).toBeDefined();
    expect(imageSources()).toEqual([]);
  });

  it("shows Riot's name of a champion Data Dragon does not know yet", async () => {
    mockApi({
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
    mockApi({
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
    mockApi({ matches: matchPages({ 0: { matches: [], nextStart: null } }) });

    renderPage(PLAYER_PAGE_PATH);

    expect(await screen.findByText('No matches yet.')).toBeDefined();
  });

  it('reports a profile that could not be loaded', async () => {
    mockApi({ profile: failure });

    renderPage(PLAYER_PAGE_PATH);

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The profile could not be loaded.',
    );
    expect(screen.queryByRole('heading', { name: 'Match history' })).toBeNull();
  });

  it('reports a match history that could not be loaded', async () => {
    mockApi({ matches: failure });

    renderPage(PLAYER_PAGE_PATH);

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The match history could not be loaded.',
    );
  });

  it('reports older matches that could not be loaded, and lets try again', async () => {
    mockApi({
      matches: matchPages({
        0: { matches: [matchSummary('KR_2')], nextStart: 1 },
      }),
    });
    renderPage(PLAYER_PAGE_PATH);
    await findMatches();

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Show more' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'More matches could not be loaded.',
    );
    expect(screen.getByRole('button', { name: 'Show more' })).toBeDefined();
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
