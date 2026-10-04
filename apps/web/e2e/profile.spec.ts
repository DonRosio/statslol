import {
  ARENA_MATCH,
  classicPlayers,
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
  await expect(matches.nth(0)).toContainText('18 hours ago · 30:34');
  await expect(matches.nth(1)).toContainText('3rd place');
  await expect(matches.nth(1)).toContainText('Wukong');

  // The profile icon and the 2 champions, all displayed by the browser.
  const images = page.locator('img');
  await expect(images).toHaveCount(3);
  for (const image of await images.all()) {
    await expect(image).toHaveJSProperty('naturalWidth', 1);
  }
});

test('loads older matches with "Show more"', async ({ page, api }) => {
  knowPlayer(api, {
    matches: [matchSummary('KR_4'), matchSummary('KR_3')],
    nextStart: 2,
  });
  api.answer(`${PLAYER_API_PATH}/matches?start=2`, {
    matches: [ARENA_MATCH],
    nextStart: null,
  });

  // Opened directly: the preview server answers the app for any page URL.
  await page.goto(PLAYER_PAGE_PATH);
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Show more' }).click();

  await expect(page.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0);
});

test('shows names and empty squares when Data Dragon is unreachable', async ({
  page,
  api,
}) => {
  knowPlayer(api);
  let failedImages = 0;
  // Registered after the fixture's route: it takes precedence.
  await page.route('https://ddragon.leagueoflegends.com/**', (route) => {
    failedImages += 1;
    return route.abort('connectionrefused');
  });

  await page.goto(PLAYER_PAGE_PATH);

  await expect.poll(() => failedImages).toBe(3);
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.getByRole('listitem').nth(0)).toContainText('Sylas');
  await expect(page.getByRole('listitem').nth(1)).toContainText('Wukong');
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

  await page.goto(PLAYER_PAGE_PATH);

  const match = page.getByRole('listitem');
  await expect(
    match.getByRole('group', { name: 'Summoner spells' }).getByRole('img'),
  ).toHaveCount(2);
  await expect(
    match.getByRole('group', { name: 'Runes' }).getByRole('img'),
  ).toHaveCount(2);
  await expect(match.getByRole('img', { name: 'Trinity Force' })).toBeVisible();
  await expect(match.getByRole('group', { name: 'Red team' })).toContainText(
    'Rival 9',
  );
  // The champion, 2 spells, 2 runes, 2 items and 10 players: all displayed by the browser.
  const images = match.locator('img');
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
