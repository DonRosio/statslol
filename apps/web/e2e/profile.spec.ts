import {
  ARENA_MATCH,
  classicDetails,
  classicPlayers,
  classicRanks,
  LOADOUT,
  matchSummary,
  PLAYER_API_PATH,
  PLAYER_PAGE_PATH,
  PROFILE,
} from '../src/test-data.ts';
import { expect, test } from './fixtures.ts';
import { knowPlayer } from './player-api.ts';

test('finds a player from the home page, then shows their profile', async ({
  page,
  api,
}) => {
  api.answer('/api/health', { status: 'ok' });
  knowPlayer(api);
  // 18 hours after the first match started.
  await page.clock.setFixedTime(new Date('2026-10-04T10:41:12Z'));

  await page.goto('/');
  await page.getByRole('combobox', { name: 'Region' }).selectOption('kr');
  await page.getByRole('textbox', { name: 'Riot ID' }).fill('Hide on bush#KR1');
  await page.getByRole('button', { name: 'Search' }).click();

  await expect(page).toHaveURL(PLAYER_PAGE_PATH);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Hide on bush#KR1' }),
  ).toBeVisible();
  // The tabs of the profile, the open one marked.
  await expect(
    page
      .getByRole('navigation', { name: 'Profile sections' })
      .getByRole('link', { name: 'Overview' }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Korea · Level 812')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Ranked Solo/Duo' }),
  ).toContainText('Challenger · 1342 LP');
  await expect(page.getByRole('region', { name: 'Ranked Flex' })).toContainText(
    'Unranked',
  );

  const matches = page.getByRole('listitem');
  await expect(matches).toHaveCount(2);
  await expect(matches.nth(0)).toContainText('Victory');
  await expect(matches.nth(0)).toContainText('18h ago · 30:34');
  await expect(matches.nth(1)).toContainText('ARAM');
  // The champion is not written on the card: its image says who it is.
  await expect(
    matches.nth(1).getByRole('img', { name: 'Wukong' }),
  ).toBeVisible();

  // The profile icon and the 2 champions, all displayed by the browser (the icon of the
  // position is the site's own image).
  const images = page.locator('img[src^="https://ddragon"]');
  // The profile icon, and the 2 champions three times: in the top mastery, in the summary,
  // and in the matches.
  await expect(images).toHaveCount(7);
  for (const image of await images.all()) {
    await expect(image).toHaveJSProperty('naturalWidth', 1);
  }
});

test('loads pages by itself, up to 5, and the next ones with "Show more"', async ({
  page,
  api,
}) => {
  // A long history: one game in each of 7 pages.
  knowPlayer(api, { matches: [matchSummary('KR_7')], nextStart: 1 });
  for (let index = 1; index < 7; index += 1) {
    api.answer(`${PLAYER_API_PATH}/matches?start=${String(index)}`, {
      matches: [matchSummary(`KR_${String(7 - index)}`)],
      nextStart: index < 6 ? index + 1 : null,
    });
  }

  // Opened directly: the preview server answers the app for any page URL.
  await page.goto(PLAYER_PAGE_PATH);
  // Without a click: 5 pages (the summary counts the last 20 games, each page costs calls).
  await expect(page.getByRole('listitem')).toHaveCount(5);
  await page.getByRole('button', { name: 'Show more' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(6);
  await page.getByRole('button', { name: 'Show more' }).click();

  await expect(page.getByRole('listitem')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0);
});

test('keeps the Arena games for their tab', async ({ page, api }) => {
  knowPlayer(api, {
    matches: [matchSummary('KR_3'), ARENA_MATCH],
    nextStart: null,
  });

  await page.goto(PLAYER_PAGE_PATH);
  // The overview has the other games only.
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByText('3rd place')).toHaveCount(0);

  const bar = page.getByRole('navigation', { name: 'Profile sections' });
  await bar.getByRole('link', { name: 'Arena' }).click();

  await expect(page).toHaveURL(`${PLAYER_PAGE_PATH}/arena`);
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByText('3rd place')).toBeVisible();
  await expect(bar.getByRole('link', { name: 'Arena' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('has a Champions tab: the champions of the season, which the position narrows down', async ({
  page,
  api,
}) => {
  knowPlayer(api);

  await page.goto(PLAYER_PAGE_PATH);
  const bar = page.getByRole('navigation', { name: 'Profile sections' });
  await bar.getByRole('link', { name: 'Champions' }).click();

  await expect(page).toHaveURL(`${PLAYER_PAGE_PATH}/champions`);
  const table = page.getByRole('table', { name: 'Champions played' });
  // The header, then Sylas and Wukong (Arena is a mode of its own).
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(page.getByText(/^6 games · /)).toBeVisible();

  await page.getByRole('button', { name: 'Top' }).click();

  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table.getByRole('row').nth(1)).toContainText('Wukong');

  // Arena has no positions: only "Fill" is lit, and the table shows the places.
  await page.getByRole('button', { name: 'Arena' }).click();
  await expect(page.getByRole('button', { name: 'Fill' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Top' })).toBeDisabled();
  await expect(table.getByRole('row').nth(1)).toContainText('3.5');
  await expect(bar.getByRole('link', { name: 'Champions' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('has a Mastery tab: a card for each champion by points, with the top 3 in the overview', async ({
  page,
  api,
}) => {
  knowPlayer(api);

  await page.goto(PLAYER_PAGE_PATH);
  const top = page.getByRole('region', { name: 'Top mastery' });
  await expect(top.getByRole('group')).toHaveCount(3);
  await expect(top.getByRole('group').first()).toContainText('324,704 points');

  await top.getByRole('link', { name: 'All champions' }).click();

  await expect(page).toHaveURL(`${PLAYER_PAGE_PATH}/mastery`);
  // A card for each of the 3 champions, with the season of the first one.
  const cards = page
    .getByRole('list', { name: 'Champion mastery' })
    .getByRole('listitem');
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText('Sylas');
  await expect(cards.first()).toContainText('324,704');
  await expect(cards.first()).toContainText('Season 16 - 4 games - 3.33 KDA');
  await expect(cards.first()).toContainText('Winrate : 50% - 2W/2L');
  await expect(
    page
      .getByRole('navigation', { name: 'Profile sections' })
      .getByRole('link', { name: 'Mastery' }),
  ).toHaveAttribute('aria-current', 'page');
});

test('shows names and empty squares when Data Dragon is unreachable', async ({
  page,
  api,
}) => {
  knowPlayer(api);
  // The images asked for (each one once: an image that fails to load is asked for again when
  // another place of the page shows it, so the requests are not counted, the images are).
  const failedImages = new Set<string>();
  // Registered after the fixture's route: it takes precedence.
  await page.route('https://ddragon.leagueoflegends.com/**', (route) => {
    failedImages.add(route.request().url());
    return route.abort('connectionrefused');
  });

  await page.goto(PLAYER_PAGE_PATH);

  // The profile icon and the 2 champions, shown in the top mastery, the summary and the matches.
  await expect.poll(() => failedImages.size).toBe(3);
  await expect(page.locator('img[src^="https://ddragon"]')).toHaveCount(0);
  // The empty squares keep the names of the champions.
  await expect(
    page.getByRole('listitem').nth(0).getByRole('img', { name: 'Sylas' }),
  ).toBeVisible();
  await expect(
    page.getByRole('listitem').nth(1).getByRole('img', { name: 'Wukong' }),
  ).toBeVisible();
});

test('shows the "not found" page for a URL the API would refuse', async ({
  page,
}) => {
  // An unknown region: no request is sent to the API (the fixture checks it).
  await page.goto('/players/xx/Hide%20on%20bush/KR1');

  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});

test('looks up another player from the header of a profile page', async ({
  page,
  api,
}) => {
  api.answer('/api/health', { status: 'ok' });
  knowPlayer(api);

  await page.goto(PLAYER_PAGE_PATH);
  const search = page.getByRole('search', { name: 'Look up another player' });
  // The page asked for Korea: the search starts there.
  await expect(search.getByRole('combobox')).toHaveValue('kr');

  await search.getByRole('textbox').fill('Faker');
  await search.getByRole('button', { name: 'Look up' }).click();
  await expect(search.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(PLAYER_PAGE_PATH);
});

test('shows the spells, runes, items and players of a match, and opens a player from it', async ({
  page,
  api,
}) => {
  knowPlayer(api, {
    matches: [
      matchSummary('KR_3', { ...LOADOUT, participants: classicPlayers() }),
    ],
    nextStart: null,
  });
  // The page of an ally, where the link of the match leads.
  const ally = '/api/v1/players/kr/Ally%201/KR1';
  api.answer(ally, {
    ...PROFILE,
    riotId: { gameName: 'Ally 1', tagLine: 'KR1' },
  });
  api.answer(`${ally}/matches?start=0`, { matches: [], nextStart: null });
  api.answer(`${ally}/mastery`, { score: 0, totalPoints: 0, champions: [] });

  await page.goto(PLAYER_PAGE_PATH);

  const match = page.getByRole('listitem');
  await expect(
    match.getByRole('group', { name: 'Summoner spells' }).getByRole('img'),
  ).toHaveCount(2);
  await expect(
    match.getByRole('group', { name: 'Runes' }).getByRole('img'),
  ).toHaveCount(2);
  await expect(match.getByRole('img', { name: 'Trinity Force' })).toBeVisible();
  await expect(
    match
      .getByRole('group', { name: 'Red team' })
      .getByRole('link', { name: 'Rival 9' }),
  ).toBeVisible();
  // The champion, 2 spells, 2 runes, 2 items and 10 players: all displayed by the browser.
  const images = match.locator('img[src^="https://ddragon"]');
  await expect(images).toHaveCount(17);
  for (const image of await images.all()) {
    await expect(image).toHaveJSProperty('naturalWidth', 1);
  }

  await match.getByRole('link', { name: 'Ally 1' }).click();

  await expect(page).toHaveURL('/players/kr/Ally%201/KR1');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ally 1#KR1' }),
  ).toBeVisible();
});

test('opens the details of a match with the arrow, and closes them', async ({
  page,
  api,
}) => {
  knowPlayer(api, {
    matches: [
      matchSummary('KR_3', { ...LOADOUT, participants: classicPlayers() }),
    ],
    nextStart: null,
  });
  api.answer('/api/v1/matches/kr/KR_3', classicDetails('KR_3'));
  api.answer('/api/v1/matches/kr/KR_3/ranks', classicRanks());

  await page.goto(PLAYER_PAGE_PATH);
  const match = page.getByRole('listitem');
  await match
    .getByRole('button', { name: 'Show the details of the match' })
    .click();

  const blue = match.getByRole('region', { name: 'Victory, Blue team' });
  await expect(blue).toBeVisible();
  await expect(blue.getByRole('row')).toHaveCount(6);
  await expect(
    match.getByRole('region', { name: 'Defeat, Red team' }),
  ).toBeVisible();
  // The images of the 2 tables (champions and items) are displayed by the browser.
  const tables = match.getByRole('region');
  for (const image of await tables
    .locator('img[src^="https://ddragon"]')
    .all()) {
    await expect(image).toHaveJSProperty('naturalWidth', 1);
  }
  // The ranks come after the table, with the site's own emblems (real images, not 1 pixel).
  await expect(blue).toContainText('DIAMOND 1');
  const emblems = blue.locator('img[alt=""]:not([src^="https://ddragon"])');
  await expect(emblems.first()).toBeVisible();
  // Displayed by the browser: wider than the 1 pixel of the fake champion images.
  await expect(emblems.first()).not.toHaveJSProperty('naturalWidth', 0);
  await expect(emblems.first()).not.toHaveJSProperty('naturalWidth', 1);

  await match
    .getByRole('button', { name: 'Hide the details of the match' })
    .click();
  await expect(blue).toHaveCount(0);
});

test('shows the "not found" page for an address under a profile that is no tab', async ({
  page,
}) => {
  // No request is sent to the API (the fixture checks it).
  await page.goto(`${PLAYER_PAGE_PATH}/no-such-tab`);

  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});
