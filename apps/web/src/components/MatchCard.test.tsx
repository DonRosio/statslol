import type { MatchSummary } from '@statslol/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { failure, matchPages, mockPlayerApi } from '../test-api.ts';
import {
  arenaPlayers,
  ARENA_MATCH,
  classicPlayers,
  LOADOUT,
  matchSummary,
  PLAYER_PAGE_PATH,
  participant,
} from '../test-data.ts';
import { at, findMatches, renderPage } from '../test-utils.tsx';

const CDN = 'https://ddragon.leagueoflegends.com/cdn';

/** Shows `match` on the page of the player, and gives its card. */
async function showMatch(
  match: MatchSummary,
  { path = PLAYER_PAGE_PATH, staticData = true } = {},
) {
  mockPlayerApi({
    matches: matchPages({ 0: { matches: [match], nextStart: null } }),
    ...(staticData ? {} : { staticData: failure }),
  });
  const rendered = renderPage(path);
  const card = at(await findMatches(), 0);
  return { ...rendered, card };
}

function slots(group: HTMLElement) {
  return [...group.children] as HTMLElement[];
}

describe('spells, runes and items', () => {
  it('shows the spells and the runes, named, from Data Dragon', async () => {
    const { card } = await showMatch(matchSummary('KR_1', LOADOUT));

    const spells = within(card).getByRole('group', { name: 'Summoner spells' });
    expect(
      within(spells)
        .getAllByRole('img')
        .map((image) => [image.getAttribute('alt'), image.getAttribute('src')]),
    ).toEqual([
      ['Flash', `${CDN}/16.19.1/img/spell/SummonerFlash.png`],
      ['Ignite', `${CDN}/16.19.1/img/spell/SummonerDot.png`],
    ]);
    const runes = within(card).getByRole('group', { name: 'Runes' });
    expect(
      within(runes)
        .getAllByRole('img')
        .map((image) => [image.getAttribute('alt'), image.getAttribute('src')]),
    ).toEqual([
      [
        'Lethal Tempo',
        `${CDN}/img/perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png`,
      ],
      ['Resolve', `${CDN}/img/perk-images/Styles/7204_Resolve.png`],
    ]);
  });

  it('shows the items in 7 slots: the trinket ends the first row, empty slots tell nothing', async () => {
    const { card } = await showMatch(matchSummary('KR_1', LOADOUT));

    const items = slots(within(card).getByRole('group', { name: 'Items' }));
    expect(items).toHaveLength(7);
    // Slots 0 and 6 (the trinket) are filled: the trinket comes 4th.
    expect(
      items.map((slot) => slot.getAttribute('alt') ?? slot.tagName),
    ).toEqual([
      'Trinity Force',
      'SPAN',
      'SPAN',
      'Stealth Ward',
      'SPAN',
      'SPAN',
      'SPAN',
    ]);
    expect(items[0]?.getAttribute('src')).toBe(
      `${CDN}/16.19.1/img/item/3078.png`,
    );
    expect(
      items.filter((slot) => slot.getAttribute('aria-hidden') === 'true'),
    ).toHaveLength(5);
  });

  it('shows the image of an item whose name Data Dragon does not give', async () => {
    const { card } = await showMatch(
      matchSummary('KR_1', { itemIds: [999_999, 0, 0, 0, 0, 0, 0] }),
    );

    const [image] = within(card)
      .getByRole('group', { name: 'Items' })
      .querySelectorAll('img');
    expect(image?.getAttribute('src')).toBe(
      `${CDN}/16.19.1/img/item/999999.png`,
    );
    // Nothing to tell about it: a decoration for screen readers.
    expect(image?.getAttribute('alt')).toBe('');
  });

  it('keeps the name of an image that fails to load, in an empty square', async () => {
    const { card } = await showMatch(matchSummary('KR_1', LOADOUT));
    const spells = within(card).getByRole('group', { name: 'Summoner spells' });

    fireEvent.error(within(spells).getByRole('img', { name: 'Flash' }));

    expect(
      within(spells).queryAllByRole('img', { hidden: false }),
    ).toHaveLength(2);
    expect(spells.querySelectorAll('img')).toHaveLength(1);
    expect(within(spells).getByRole('img', { name: 'Flash' }).tagName).toBe(
      'SPAN',
    );
  });

  it('shows no image without the static data, but keeps the layout', async () => {
    // No position: its icon is the site's own image, shown whatever Data Dragon does.
    const { card } = await showMatch(
      matchSummary('KR_1', { ...LOADOUT, position: null }),
      { staticData: false },
    );

    expect(card.querySelectorAll('img')).toHaveLength(0);
    expect(
      slots(within(card).getByRole('group', { name: 'Items' })),
    ).toHaveLength(7);
  });

  it('has no spells or runes where the mode has none', async () => {
    const { card } = await showMatch(
      matchSummary('KR_1', { spellIds: [], runes: null }),
    );

    expect(
      within(card).queryByRole('group', { name: 'Summoner spells' }),
    ).toBeNull();
    expect(within(card).queryByRole('group', { name: 'Runes' })).toBeNull();
  });
});

describe('players of the match', () => {
  it('lists both sides, with the player marked and the others linked to their page', async () => {
    const { card } = await showMatch(
      matchSummary('KR_1', { participants: classicPlayers() }),
    );

    const blue = within(card).getByRole('group', { name: 'Blue team' });
    const red = within(card).getByRole('group', { name: 'Red team' });
    expect(blue.children).toHaveLength(5);
    expect(red.children).toHaveLength(5);
    // The player whose page this is: marked, and not a link to the page it is on.
    const self = within(blue).getByRole('img', { name: 'Hide on bush' });
    expect(self.getAttribute('aria-current')).toBe('true');
    expect(self.getAttribute('title')).toBe('Hide on bush#KR1');
    expect(
      within(blue).queryByRole('link', { name: 'Hide on bush' }),
    ).toBeNull();
    // The others: a link to their profile, on the same server, with their tag on hover.
    expect(within(blue).getAllByRole('link')).toHaveLength(4);
    expect(within(red).getAllByRole('link')).toHaveLength(5);
    const ally = within(blue).getByRole('link', { name: 'Ally 1' });
    expect(ally.getAttribute('href')).toBe('/players/kr/Ally%201/KR1');
    expect(ally.getAttribute('title')).toBe('Ally 1#KR1');
  });

  it('shows the champion of each player', async () => {
    const { card } = await showMatch(
      matchSummary('KR_1', { participants: classicPlayers() }),
    );

    const blue = within(card).getByRole('group', { name: 'Blue team' });
    expect(
      [...blue.querySelectorAll('img')].map((image) =>
        image.getAttribute('src'),
      ),
    ).toEqual([
      `${CDN}/16.19.1/img/champion/Sylas.png`,
      ...Array<string>(4).fill(`${CDN}/16.19.1/img/champion/MonkeyKing.png`),
    ]);
  });

  it('opens the profile of a player from the match', async () => {
    const { card, router } = await showMatch(
      matchSummary('KR_1', { participants: classicPlayers() }),
    );

    await userEvent
      .setup()
      .click(within(card).getByRole('link', { name: 'Rival 7' }));

    expect(router.state.location.pathname).toBe('/players/kr/Rival%207/KR1');
  });

  it('links to the server of the page', async () => {
    const { card } = await showMatch(
      matchSummary('EUW1_1', { participants: classicPlayers() }),
      { path: '/players/euw/Hide%20on%20bush/KR1' },
    );

    expect(
      within(card).getByRole('link', { name: 'Ally 1' }).getAttribute('href'),
    ).toBe('/players/euw/Ally%201/KR1');
  });

  it('shows the champion instead of a name Riot did not give, with no link', async () => {
    const players = classicPlayers();
    players[1] = participant({
      riotId: null,
      championId: 62,
      championName: 'MonkeyKing',
      isPlayer: false,
    });
    const { card } = await showMatch(
      matchSummary('KR_1', { participants: players }),
    );

    const blue = within(card).getByRole('group', { name: 'Blue team' });
    expect(within(blue).getByRole('img', { name: 'MonkeyKing' })).toBeDefined();
    expect(within(blue).queryByRole('link', { name: 'MonkeyKing' })).toBeNull();
    expect(within(blue).getAllByRole('link')).toHaveLength(3);
  });

  it('shows only the team of the player in Arena, which has 18 players', async () => {
    // The Arena games are in the Arena tab.
    const { card } = await showMatch(
      { ...ARENA_MATCH, participants: arenaPlayers() },
      { path: `${PLAYER_PAGE_PATH}/arena` },
    );

    const team = within(card).getByRole('group', {
      name: 'Team of the player',
    });
    expect(
      [...team.children].map((entry) => entry.getAttribute('aria-label')),
    ).toEqual(['Duelist 6', 'Duelist 7', 'Duelist 8']);
    expect(within(card).queryByRole('group', { name: 'Blue team' })).toBeNull();
    expect(within(card).queryByRole('group', { name: 'Red team' })).toBeNull();
  });

  it('shows no players for a match that does not list them', async () => {
    const { card } = await showMatch(
      matchSummary('KR_1', { participants: [] }),
    );

    expect(within(card).queryByRole('group', { name: 'Blue team' })).toBeNull();
    expect(screen.queryAllByRole('link', { name: /Ally/ })).toHaveLength(0);
  });
});

describe('numbers of a game', () => {
  it('shows the level, and the position as an icon', async () => {
    const { card } = await showMatch(
      matchSummary('KR_1', { level: 17, position: 'JUNGLE' }),
    );

    expect(within(card).getByText('Lvl. 17')).toBeDefined();
    expect(within(card).getByRole('img', { name: 'Jungle' })).toBeDefined();
  });

  it('shows the deaths apart, and the score for the screen readers', async () => {
    const { card } = await showMatch(
      matchSummary('KR_1', { kills: 1, deaths: 4, assists: 3 }),
    );

    const deaths = within(card).getByText('4');
    expect(deaths.className).toContain('deaths');
    expect(deaths.parentElement?.textContent).toBe(
      'Kills, deaths, assists: 1 / 4 / 3',
    );
  });

  it('shows the creep score and its average per minute', async () => {
    const { card } = await showMatch(
      matchSummary('KR_1', {
        creepScore: 103,
        durationSeconds: 935,
        visionScore: 40,
      }),
    );

    expect(within(card).getByText('103 CS (6.6)')).toBeDefined();
    expect(within(card).queryByText(/vision/)).toBeNull();
  });

  it('shows the vision score instead, with its average per minute, for a support', async () => {
    const { card } = await showMatch(
      matchSummary('KR_1', {
        position: 'UTILITY',
        creepScore: 31,
        visionScore: 60,
        durationSeconds: 1800,
      }),
    );

    expect(within(card).getByText('60 vision (2.0)')).toBeDefined();
    expect(within(card).queryByText(/CS \(/)).toBeNull();
    expect(within(card).getByRole('img', { name: 'Support' })).toBeDefined();
  });

  it('puts the spells, the runes and the items in the same frame', async () => {
    const { card } = await showMatch(matchSummary('KR_1', LOADOUT));

    const frame = within(card).getByRole('group', {
      name: 'Items',
    }).parentElement;
    expect(
      [...(frame?.children ?? [])].map((part) =>
        part.getAttribute('aria-label'),
      ),
    ).toEqual(['Summoner spells', 'Runes', 'Items']);
  });

  it('shows the main rune bigger than the tree of the secondary ones, with no square behind', async () => {
    const { card } = await showMatch(matchSummary('KR_1', LOADOUT));

    const runes = within(card).getByRole('group', { name: 'Runes' });
    const [keystone, secondary] = within(runes).getAllByRole('img');
    expect(keystone?.className).toContain('keystone');
    expect(secondary?.className).toContain('secondary');
    // The squares behind the spells and the items are not for the runes.
    expect(keystone?.className).not.toContain('slot');
    expect(secondary?.className).not.toContain('slot');
  });

  it('keeps the place of the runes, empty and hidden, where there are none', async () => {
    const { card } = await showMatch(
      matchSummary('KR_1', { ...LOADOUT, runes: null }),
    );

    // The items stay in line with those of the other games.
    const frame = within(card).getByRole('group', {
      name: 'Items',
    }).parentElement;
    expect(
      [...(frame?.children ?? [])].map((part) => [
        part.getAttribute('aria-label'),
        part.getAttribute('aria-hidden'),
      ]),
    ).toEqual([
      ['Summoner spells', null],
      [null, 'true'],
      ['Items', null],
    ]);
  });
});

describe('result of a game', () => {
  it('is told by the color of the card, and by a word only screen readers get', async () => {
    const { card } = await showMatch(matchSummary('KR_1', { result: 'loss' }));

    expect(card.getAttribute('data-result')).toBe('loss');
    const word = within(card).getByText('Defeat');
    expect(word.className).toContain('visually-hidden');
  });

  it('is written when the color cannot tell it: a place in Arena, a remake', async () => {
    const { card: remake } = await showMatch(
      matchSummary('KR_1', { result: 'remake' }),
    );
    const remakeWord = within(remake).getByText('Remake');
    expect(remakeWord.className).not.toContain('visually-hidden');
  });

  it('is a place, written, in Arena', async () => {
    const { card } = await showMatch(
      { ...ARENA_MATCH, participants: [] },
      { path: `${PLAYER_PAGE_PATH}/arena` },
    );

    expect(within(card).getByText('3rd place').className).not.toContain(
      'visually-hidden',
    );
    expect(within(card).queryByText('Victory')).toBeNull();
  });
});
