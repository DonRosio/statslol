import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { failure, mockPlayerApi } from '../test-api.ts';
import { championRecord, PLAYER_PAGE_PATH } from '../test-data.ts';
import { recordRequests } from '../test-server.ts';
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

describe('the Champions tab', () => {
  it('adds up what the player did with each champion, the most played first', async () => {
    mockPlayerApi();

    renderPage(CHAMPIONS_PATH);

    // Sylas: 4 games in 2 modes, 2 won. Wukong (the name from Data Dragon): 2 games won.
    expect(await rows()).toEqual([
      ['Sylas', '50%2W 2L', '3.33 KDA4.8 / 3.8 / 7.8', '150.05.5/min'],
      ['Wukong', '100%2W 0L', '6.67 KDA6.0 / 1.5 / 4.0', '200.06.7/min'],
    ]);
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

  it('says how many games it counts, and that they are not all of them', async () => {
    mockPlayerApi();

    renderPage(CHAMPIONS_PATH);

    const note = await screen.findByText(/games counted/);
    expect(note.textContent).toContain('6 games counted');
    expect(note.textContent).toContain('not the whole history');
  });

  it('keeps one mode', async () => {
    mockPlayerApi();
    const user = userEvent.setup();
    renderPage(CHAMPIONS_PATH);
    await rows();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Game mode' }),
      'Solo/Duo',
    );

    expect(await rows()).toEqual([
      ['Sylas', '67%2W 1L', '6.00 KDA5.0 / 2.0 / 7.0', '180.06.0/min'],
      ['Wukong', '100%2W 0L', '6.67 KDA6.0 / 1.5 / 4.0', '200.06.7/min'],
    ]);
    expect(screen.getByText(/5 games counted/)).toBeDefined();
  });

  it('offers the modes and positions the player has games in, no others', async () => {
    mockPlayerApi();
    renderPage(CHAMPIONS_PATH);
    await rows();

    const options = (name: string) =>
      within(screen.getByRole('combobox', { name }))
        .getAllByRole('option')
        .map((option) => option.textContent);

    expect(options('Game mode')).toEqual(['All modes', 'Solo/Duo', 'ARAM']);
    expect(options('Position')).toEqual(['All positions', 'Top', 'Mid']);
  });

  it('keeps one position', async () => {
    mockPlayerApi();
    const user = userEvent.setup();
    renderPage(CHAMPIONS_PATH);
    await rows();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Position' }),
      'Top',
    );

    expect((await rows()).map(([champion]) => champion)).toEqual(['Wukong']);
  });

  it('searches a champion by the name the page shows', async () => {
    mockPlayerApi();
    const user = userEvent.setup();
    renderPage(CHAMPIONS_PATH);
    await rows();

    await user.type(screen.getByRole('searchbox'), 'wuk');

    expect((await rows()).map(([champion]) => champion)).toEqual(['Wukong']);
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

  it('says so when no game is stored yet', async () => {
    mockPlayerApi({ champions: () => HttpResponse.json({ records: [] }) });

    renderPage(CHAMPIONS_PATH);

    expect(await screen.findByText(/No game is stored/)).toBeDefined();
    expect(screen.queryByRole('combobox', { name: 'Game mode' })).toBeNull();
  });

  it('keeps the champion of a mode without positions when no position is chosen', async () => {
    mockPlayerApi({
      champions: () =>
        HttpResponse.json({
          records: [championRecord({ position: null, queueId: 450 })],
        }),
    });

    renderPage(CHAMPIONS_PATH);

    expect((await rows()).map(([champion]) => champion)).toEqual(['Sylas']);
  });

  it('shows the error, and tries again', async () => {
    let failing = true;
    mockPlayerApi({
      champions: (info) =>
        failing
          ? failure(info)
          : HttpResponse.json({ records: [championRecord()] }),
    });
    const user = userEvent.setup();
    renderPage(CHAMPIONS_PATH);

    await screen.findByText(
      'The champions could not be loaded.',
      {},
      { timeout: 4000 },
    );
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await rows()).toHaveLength(1);
  });

  it('asks the API once for a player, whatever the filters', async () => {
    mockPlayerApi();
    const requests = recordRequests();
    const user = userEvent.setup();
    renderPage(CHAMPIONS_PATH);
    await rows();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Game mode' }),
      'ARAM',
    );
    await waitFor(() => {
      expect(screen.getByText(/1 game counted/)).toBeDefined();
    });

    expect(requests.filter((path) => path.endsWith('/champions'))).toHaveLength(
      1,
    );
  });
});
