import type { MatchSummary } from '@statslol/shared';
import { within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { matchPages, mockPlayerApi } from '../test-api.ts';
import {
  ARENA_MATCH,
  classicDetails,
  classicPlayers,
  LOADOUT,
  matchSummary,
  PLAYER_PAGE_PATH,
} from '../test-data.ts';
import { recordRequests } from '../test-server.ts';
import { at, findMatches, renderPage } from '../test-utils.tsx';

const SHOW = { name: 'Show the details of the match' };
const HIDE = { name: 'Hide the details of the match' };

/** A ranked match with its 10 players, and the Arena match with its 18. */
const CLASSIC = matchSummary('KR_3', {
  ...LOADOUT,
  participants: classicPlayers(),
});

async function showCard(
  match: MatchSummary,
  options: Parameters<typeof mockPlayerApi>[0] = {},
) {
  mockPlayerApi({
    matches: matchPages({ 0: { matches: [match], nextStart: null } }),
    ...options,
  });
  renderPage(PLAYER_PAGE_PATH);
  return at(await findMatches(), 0);
}

async function openDetails(card: HTMLElement) {
  await userEvent.setup().click(within(card).getByRole('button', SHOW));
}

describe('details of a match', () => {
  it('are not asked to the API before the arrow is clicked', async () => {
    const requests = recordRequests();
    const card = await showCard(CLASSIC);

    expect(
      within(card).getByRole('button', SHOW).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(requests.some((path) => path.startsWith('/api/v1/matches/'))).toBe(
      false,
    );
  });

  it('show both teams, with who won, once the arrow is clicked', async () => {
    const requests = recordRequests();
    const card = await showCard(CLASSIC);

    await openDetails(card);

    const blue = await within(card).findByRole('region', {
      name: 'Victory, Blue team',
    });
    const red = within(card).getByRole('region', { name: 'Defeat, Red team' });
    expect(within(blue).getAllByRole('row')).toHaveLength(1 + 5);
    expect(within(red).getAllByRole('row')).toHaveLength(1 + 5);
    expect(requests).toContain('/api/v1/matches/kr/KR_3');
    const button = within(card).getByRole('button', HIDE);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(
      card.querySelector(
        `#${CSS.escape(button.getAttribute('aria-controls') ?? '')}`,
      ),
    ).not.toBeNull();
  });

  it('totals the team: kills, gold, and what it took on the map', async () => {
    const card = await showCard(CLASSIC);

    await openDetails(card);

    const blue = await within(card).findByRole('region', {
      name: 'Victory, Blue team',
    });
    expect(within(blue).getByText('30 kills · 52.3k gold')).toBeDefined();
    expect(
      within(blue).getByText(/9 towers · 3 dragons · 1 barons · 1 inhibitors/),
    ).toBeDefined();
    const red = within(card).getByRole('region', { name: 'Defeat, Red team' });
    expect(
      within(red).getByText(/2 towers · 1 dragons · 0 barons · 1 heralds/),
    ).toBeDefined();
  });

  it('give each player the numbers of the game', async () => {
    const card = await showCard(CLASSIC);

    await openDetails(card);

    const blue = await within(card).findByRole('region', {
      name: 'Victory, Blue team',
    });
    const rows = within(blue).getAllByRole('row').slice(1);
    const first = at(rows, 0);
    // Hide on bush#KR1: 7 / 2 / 9 (8.00), 10,000 damage, 192 CS in 30:34 (6.3 per minute).
    const cells = within(first)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells).toEqual([
      'Hide on bush',
      '7 / 2 / 98.00',
      '10,000',
      '6.3CS/min',
      '',
    ]);
  });

  it('write neither the level of the players, nor the names of the columns', async () => {
    const card = await showCard(CLASSIC);

    await openDetails(card);

    const blue = await within(card).findByRole('region', {
      name: 'Victory, Blue team',
    });
    expect(within(blue).queryByText(/Lvl/)).toBeNull();
    // The columns keep their names for screen readers, out of sight.
    const headers = within(blue).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Player',
      'KDA',
      'Damage to champions',
      'Creep score per minute, or vision score',
      'Items',
    ]);
    expect(headers[0]?.parentElement?.className).toContain('visually-hidden');
  });

  it('show the vision score instead of the creep score for a support', async () => {
    const details = classicDetails('KR_3');
    const [blue] = details.teams;
    const support = blue?.players[1];
    if (support === undefined) throw new Error('A team has players');
    support.position = 'UTILITY';
    support.visionScore = 58;
    const card = await showCard(CLASSIC, {
      matchDetails: () => HttpResponse.json(details),
    });

    await openDetails(card);

    const region = await within(card).findByRole('region', {
      name: 'Victory, Blue team',
    });
    const cell = (row: number) =>
      at(
        within(at(within(region).getAllByRole('row'), row)).getAllByRole(
          'cell',
        ),
        3,
      ).textContent;
    expect(cell(2)).toBe('58vision');
    // The others: the minions per minute.
    expect(cell(1)).toBe('6.3CS/min');
  });

  it('mark the player of the page, and link the others to their page', async () => {
    const card = await showCard(CLASSIC);

    await openDetails(card);

    const blue = await within(card).findByRole('region', {
      name: 'Victory, Blue team',
    });
    const rows = within(blue).getAllByRole('row');
    const self = at(rows, 1);
    const ally = at(rows, 2);
    expect(self.getAttribute('aria-current')).toBe('true');
    expect(within(self).queryByRole('link')).toBeNull();
    expect(ally.getAttribute('aria-current')).toBeNull();
    const link = within(ally).getByRole('link', {
      name: 'Ally 1',
    });
    expect(link.getAttribute('href')).toBe('/players/kr/Ally%201/KR1');
    expect(link.getAttribute('title')).toBe('Ally 1#KR1');
  });

  it('draw the damage of each player compared to the one who dealt the most of the match', async () => {
    const card = await showCard(CLASSIC);

    await openDetails(card);

    const blue = await within(card).findByRole('region', {
      name: 'Victory, Blue team',
    });
    const red = within(card).getByRole('region', { name: 'Defeat, Red team' });
    const width = (row: HTMLElement) =>
      row.querySelector<HTMLElement>('[aria-hidden="true"] > span')?.style
        .width;
    // 10,000 · participant number, the most being the 10th: 100,000.
    expect(width(at(within(blue).getAllByRole('row'), 1))).toBe('10%');
    expect(width(at(within(red).getAllByRole('row'), 5))).toBe('100%');
  });

  it('show the items, named', async () => {
    const card = await showCard(CLASSIC);

    await openDetails(card);

    const blue = await within(card).findByRole('region', {
      name: 'Victory, Blue team',
    });
    const row = at(within(blue).getAllByRole('row'), 1);
    expect(
      within(row)
        .getAllByRole('img')
        .map((image) => image.getAttribute('alt')),
    ).toEqual(['Sylas', 'Trinity Force', 'Stealth Ward']);
  });

  it('close with the arrow, and are not asked again when opened again', async () => {
    const requests = recordRequests();
    const card = await showCard(CLASSIC);
    const user = userEvent.setup();

    await user.click(within(card).getByRole('button', SHOW));
    await within(card).findByRole('region', { name: 'Victory, Blue team' });
    await user.click(within(card).getByRole('button', HIDE));
    expect(
      within(card).queryByRole('region', { name: 'Victory, Blue team' }),
    ).toBeNull();
    await user.click(within(card).getByRole('button', SHOW));

    expect(
      await within(card).findByRole('region', { name: 'Victory, Blue team' }),
    ).toBeDefined();
    expect(
      requests.filter((path) => path === '/api/v1/matches/kr/KR_3'),
    ).toHaveLength(1);
  });

  it('say so while they load', async () => {
    const card = await showCard(CLASSIC, {
      matchDetails: () => delay('infinite'),
    });

    await openDetails(card);

    expect(
      await within(card).findByText('Loading the details of the match…'),
    ).toBeDefined();
    expect(
      within(card).queryByRole('region', { name: 'Victory, Blue team' }),
    ).toBeNull();
  });

  it('explain why they could not be loaded, and load them again', async () => {
    let calls = 0;
    const card = await showCard(CLASSIC, {
      matchDetails: () => {
        calls += 1;
        return calls === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(classicDetails('KR_3'));
      },
    });

    await openDetails(card);

    expect((await within(card).findByRole('alert')).textContent).toBe(
      'The details of the match could not be loaded. Something went wrong on our side. Try again in a moment.',
    );
    await userEvent
      .setup()
      .click(within(card).getByRole('button', { name: 'Try again' }));
    expect(
      await within(card).findByRole('region', { name: 'Victory, Blue team' }),
    ).toBeDefined();
    expect(within(card).queryByRole('alert')).toBeNull();
  });
});

describe('details of an Arena match', () => {
  async function showArena() {
    return showCard({ ...ARENA_MATCH, participants: [] });
  }

  it('list the teams by place, without sides', async () => {
    const card = await showArena();

    await openDetails(card);

    await within(card).findByRole('region', { name: '1st place' });
    expect(
      within(card)
        .getAllByRole('region')
        .map((team) => team.getAttribute('aria-label')),
    ).toEqual([
      '1st place',
      '2nd place',
      '3rd place',
      '4th place',
      '5th place',
      '6th place',
    ]);
    expect(within(card).queryByText(/towers/)).toBeNull();
    // No minions to count in Arena.
    expect(within(card).queryByText('CS/min')).toBeNull();
  });
});

describe('tabs of the details', () => {
  const tab = (card: HTMLElement, name: string) =>
    within(card).getByRole('tab', { name });

  it('open on "General", next to "Analysis"', async () => {
    const card = await showCard(CLASSIC);

    await openDetails(card);

    expect(
      within(card)
        .getAllByRole('tab')
        .map((one) => [one.textContent, one.getAttribute('aria-selected')]),
    ).toEqual([
      ['General', 'true'],
      ['Analysis', 'false'],
    ]);
    expect(
      await within(card).findByRole('region', { name: 'Victory, Blue team' }),
    ).toBeDefined();
    // The panel is the one of the selected tab.
    const panel = within(card).getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tab(card, 'General').id);
    expect(tab(card, 'General').getAttribute('aria-controls')).toBe(panel.id);
  });

  it('show the analysis, which is not there yet, with a click', async () => {
    const card = await showCard(CLASSIC);
    await openDetails(card);
    await within(card).findByRole('region', { name: 'Victory, Blue team' });

    await userEvent.setup().click(tab(card, 'Analysis'));

    expect(tab(card, 'Analysis').getAttribute('aria-selected')).toBe('true');
    expect(
      within(card).getByText('The analysis is coming soon.'),
    ).toBeDefined();
    expect(
      within(card).queryByRole('region', { name: 'Victory, Blue team' }),
    ).toBeNull();
  });

  it('go from one to the other with the arrows, as a tab bar does', async () => {
    const card = await showCard(CLASSIC);
    await openDetails(card);
    const user = userEvent.setup();
    tab(card, 'General').focus();

    await user.keyboard('{ArrowRight}');

    expect(tab(card, 'Analysis').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab(card, 'Analysis'));
    // Only the selected tab is reached with the Tab key.
    expect(tab(card, 'General').getAttribute('tabindex')).toBe('-1');
    await user.keyboard('{ArrowRight}');
    expect(tab(card, 'General').getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{End}');
    expect(tab(card, 'Analysis').getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Home}');
    expect(tab(card, 'General').getAttribute('aria-selected')).toBe('true');
  });

  it('come back on "General" when the details are opened again', async () => {
    const card = await showCard(CLASSIC);
    const user = userEvent.setup();
    await user.click(within(card).getByRole('button', SHOW));
    await user.click(tab(card, 'Analysis'));
    await user.click(within(card).getByRole('button', HIDE));

    await user.click(within(card).getByRole('button', SHOW));

    expect(tab(card, 'General').getAttribute('aria-selected')).toBe('true');
  });
});
