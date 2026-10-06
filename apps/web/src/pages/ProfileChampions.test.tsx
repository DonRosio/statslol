import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { failure, mockPlayerApi } from '../test-api.ts';
import {
  CHAMPION_RECORDS,
  CURRENT_SEASON,
  PLAYER_PAGE_PATH,
  SYNC_DONE,
} from '../test-data.ts';
import { server } from '../test-server.ts';
import { renderPage } from '../test-utils.tsx';

const CHAMPIONS_PATH = `${PLAYER_PAGE_PATH}/champions`;

/** The rows of the table (the header excluded), each as the text of its cells. */
async function rows(): Promise<string[][]> {
  const table = await screen.findByRole('table', { name: 'Champions played' });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    );
}

/** The names of the champions of the table. */
async function champions(): Promise<(string | null)[]> {
  return (await rows()).map(([champion]) => champion ?? null);
}

function button(name: string) {
  return screen.getByRole('button', { name });
}

describe('the Champions tab', () => {
  it('adds up what the player did with each champion in the season, the most played first', async () => {
    mockPlayerApi();

    renderPage(CHAMPIONS_PATH);

    // Sylas: 4 games in 2 modes, 2 won. Wukong (the name from Data Dragon): 2 games won.
    // Arena is a mode of its own: not in "All".
    expect(await rows()).toEqual([
      ['Sylas', '50%2W 2L', '3.33 KDA4.8 / 3.8 / 7.8', '150.05.5/min'],
      ['Wukong', '100%2W 0L', '6.67 KDA6.0 / 1.5 / 4.0', '200.06.7/min'],
    ]);
    expect(screen.getByText(`6 games · ${CURRENT_SEASON.label}`)).toBeDefined();
  });

  it('is in the bar, marked when it is open', async () => {
    mockPlayerApi();

    renderPage(CHAMPIONS_PATH);

    const bar = await screen.findByRole('navigation', {
      name: 'Profile sections',
    });
    expect(
      within(bar)
        .getAllByRole('link')
        .find((link) => link.getAttribute('aria-current') === 'page')
        ?.textContent,
    ).toBe('Champions');
  });

  it('opens on all the positions and all the modes, with the current season', async () => {
    mockPlayerApi();

    renderPage(CHAMPIONS_PATH);
    await rows();

    expect(button('All roles').getAttribute('aria-pressed')).toBe('true');
    expect(button('All').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('combobox', { name: 'Season' })).toHaveProperty(
      'value',
      CURRENT_SEASON.id,
    );
  });

  it('has the 6 positions, and the 6 modes, of the page', async () => {
    mockPlayerApi();

    renderPage(CHAMPIONS_PATH);
    await rows();

    const names = (group: string) =>
      within(screen.getByRole('group', { name: group }))
        .getAllByRole('button')
        .map((item) => item.getAttribute('aria-label') ?? item.textContent);
    expect(names('Position')).toEqual([
      'All roles',
      'Top',
      'Jungle',
      'Mid',
      'Bot',
      'Support',
    ]);
    expect(names('Game mode')).toEqual([
      'All',
      'Solo/Duo',
      'Normal draft',
      'Flex',
      'Arena',
      'ARAM',
    ]);
  });

  it('keeps one position', async () => {
    mockPlayerApi();
    const user = userEvent.setup();
    renderPage(CHAMPIONS_PATH);
    await rows();

    await user.click(button('Top'));

    expect(await champions()).toEqual(['Wukong']);
    expect(button('Top').getAttribute('aria-pressed')).toBe('true');
    expect(button('All roles').getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps one mode', async () => {
    mockPlayerApi();
    const user = userEvent.setup();
    renderPage(CHAMPIONS_PATH);
    await rows();

    await user.click(button('Solo/Duo'));

    expect(await rows()).toEqual([
      ['Sylas', '67%2W 1L', '6.00 KDA5.0 / 2.0 / 7.0', '180.06.0/min'],
      ['Wukong', '100%2W 0L', '6.67 KDA6.0 / 1.5 / 4.0', '200.06.7/min'],
    ]);
    expect(screen.getByText(`5 games · ${CURRENT_SEASON.label}`)).toBeDefined();
  });

  it('has no positions in Arena and ARAM: only "Fill" is lit, the others are out of reach', async () => {
    mockPlayerApi();
    const user = userEvent.setup();
    renderPage(CHAMPIONS_PATH);
    await rows();

    await user.click(button('ARAM'));

    expect(button('Fill').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: 'All roles' })).toBeNull();
    for (const name of ['Top', 'Jungle', 'Mid', 'Bot', 'Support']) {
      expect((button(name) as HTMLButtonElement).disabled).toBe(true);
    }
    // The games of ARAM have no position: they are all there, a position chosen before
    // or not.
    expect(await champions()).toEqual(['Sylas']);
  });

  it('gives the average place, not the CS, in Arena', async () => {
    mockPlayerApi();
    const user = userEvent.setup();
    renderPage(CHAMPIONS_PATH);
    await rows();

    await user.click(button('Arena'));

    expect(await rows()).toEqual([
      ['Sylas', '50%1W 1L', '3.25 KDA10.0 / 4.0 / 3.0', '3.5average'],
    ]);
    expect(screen.getByRole('columnheader', { name: 'Place' })).toBeDefined();
    expect(screen.queryByRole('columnheader', { name: 'CS' })).toBeNull();
  });

  it('gives the chosen position back when a mode with positions comes back', async () => {
    mockPlayerApi();
    const user = userEvent.setup();
    renderPage(CHAMPIONS_PATH);
    await rows();
    await user.click(button('Top'));

    await user.click(button('ARAM'));
    await user.click(button('Flex'));

    expect(button('Top').getAttribute('aria-pressed')).toBe('true');
  });

  it('searches a champion by the name the page shows', async () => {
    mockPlayerApi();
    const user = userEvent.setup();
    renderPage(CHAMPIONS_PATH);
    await rows();

    await user.type(screen.getByRole('searchbox'), 'wuk');

    expect(await champions()).toEqual(['Wukong']);
  });

  it('says so when no champion fits the filters', async () => {
    mockPlayerApi();
    const user = userEvent.setup();
    renderPage(CHAMPIONS_PATH);
    await rows();

    await user.type(screen.getByRole('searchbox'), 'nobody');

    expect(
      await screen.findByText('No champion matches these filters.'),
    ).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('says so when no game is stored for the season', async () => {
    mockPlayerApi({
      champions: () =>
        HttpResponse.json({ season: CURRENT_SEASON.id, records: [] }),
    });

    renderPage(CHAMPIONS_PATH);

    expect(
      await screen.findByText(`No game stored for ${CURRENT_SEASON.label}.`),
    ).toBeDefined();
  });

  it('shows the error, and tries again', async () => {
    let failing = true;
    mockPlayerApi({
      champions: (info) =>
        failing
          ? failure(info)
          : HttpResponse.json({
              season: CURRENT_SEASON.id,
              records: CHAMPION_RECORDS,
            }),
    });
    const user = userEvent.setup();
    renderPage(CHAMPIONS_PATH);

    await screen.findByText('The champions could not be loaded.');
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await rows()).toHaveLength(2);
  });
});

describe('the seasons', () => {
  /** Records what is asked for a season, by method and query. */
  function recordSeasons() {
    const asked: string[] = [];
    mockPlayerApi({
      champions: ({ request }) => {
        asked.push(`GET ${new URL(request.url).search}`);
        return HttpResponse.json({
          season: new URL(request.url).searchParams.get('season'),
          records: CHAMPION_RECORDS,
        });
      },
      seasonSync: ({ request }) => {
        asked.push(`${request.method} sync ${new URL(request.url).search}`);
        return HttpResponse.json(SYNC_DONE);
      },
    });
    return asked;
  }

  it('are in a menu, the latest first (only Season 16 for now)', async () => {
    mockPlayerApi();
    renderPage(CHAMPIONS_PATH);
    await rows();

    expect(
      within(screen.getByRole('combobox', { name: 'Season' }))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Season 16']);
  });

  it('are loaded by the server when the tab opens, once', async () => {
    const asked = recordSeasons();

    renderPage(CHAMPIONS_PATH);
    await rows();

    const season = `?season=${CURRENT_SEASON.id}`;
    expect(asked.filter((line) => line.startsWith('POST'))).toEqual([
      `POST sync ${season}`,
    ]);
    expect(asked).toContain(`GET ${season}`);
  });
});

describe('the loading of a season', () => {
  const running = { state: 'running', done: 40, total: 100, failed: 2 };

  it('shows how far it is, with a bar', async () => {
    mockPlayerApi({ seasonSync: () => HttpResponse.json(running) });

    renderPage(CHAMPIONS_PATH);

    expect(
      await screen.findByText('Loading the games of the season: 42 / 100'),
    ).toBeDefined();
    const bar = screen.getByRole('progressbar', {
      name: 'Games of the season loaded',
    });
    expect(bar.getAttribute('value')).toBe('42');
    expect(bar.getAttribute('max')).toBe('100');
    // The games already stored are shown meanwhile.
    expect(await rows()).toHaveLength(2);
  });

  it('says when it looks for the games, and when it waits its turn', async () => {
    mockPlayerApi({
      seasonSync: () =>
        HttpResponse.json({ state: 'running', done: 0, total: 0, failed: 0 }),
    });
    renderPage(CHAMPIONS_PATH);
    expect(
      await screen.findByText('Looking for the games of the season…'),
    ).toBeDefined();
  });

  it('says when it waits its turn', async () => {
    mockPlayerApi({
      seasonSync: () =>
        HttpResponse.json({ state: 'queued', done: 0, total: 0, failed: 0 }),
    });
    renderPage(CHAMPIONS_PATH);
    expect(
      await screen.findByText(
        'Waiting for the games of another player to finish loading…',
      ),
    ).toBeDefined();
  });

  it('says nothing once it is done, and the games Riot could not give', async () => {
    mockPlayerApi({
      seasonSync: () =>
        HttpResponse.json({ state: 'done', done: 7, total: 8, failed: 1 }),
    });
    renderPage(CHAMPIONS_PATH);
    expect(
      await screen.findByText('1 game of the season could not be loaded.'),
    ).toBeDefined();
  });

  it('says nothing when everything is loaded', async () => {
    mockPlayerApi();
    renderPage(CHAMPIONS_PATH);
    await rows();

    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/Loading the games/)).toBeNull();
  });

  it('says so when it stopped', async () => {
    mockPlayerApi({
      seasonSync: () =>
        HttpResponse.json({ state: 'failed', done: 3, total: 9, failed: 0 }),
    });
    renderPage(CHAMPIONS_PATH);
    expect(
      await screen.findByText(/The loading of the season stopped/),
    ).toBeDefined();
    expect(await rows()).toHaveLength(2);
  });

  it('keeps showing the games when the loading cannot be started', async () => {
    mockPlayerApi({ seasonSync: failure });
    renderPage(CHAMPIONS_PATH);

    expect(await rows()).toHaveLength(2);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('asks again until it is done, then reads the statistics a last time', async () => {
    let progress = 0;
    let statsReads = 0;
    mockPlayerApi({
      seasonSync: () => {
        progress += 1;
        return HttpResponse.json(
          progress < 3
            ? { state: 'running', done: progress, total: 5, failed: 0 }
            : { state: 'done', done: 5, total: 5, failed: 0 },
        );
      },
    });
    // Declared last: it takes precedence over the default answer.
    server.use(
      http.get('/api/v1/players/:region/:name/:tag/champions', () => {
        statsReads += 1;
        return HttpResponse.json({
          season: CURRENT_SEASON.id,
          records: CHAMPION_RECORDS,
        });
      }),
    );

    renderPage(CHAMPIONS_PATH);

    await screen.findByText(/Loading the games of the season/);
    await waitFor(
      () => {
        expect(screen.queryByRole('progressbar')).toBeNull();
      },
      { timeout: 8000 },
    );
    await waitFor(() => {
      expect(statsReads).toBeGreaterThanOrEqual(2);
    });
  }, 15_000);
});
