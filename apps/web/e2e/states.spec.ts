import {
  PLAYER_API_PATH,
  PLAYER_PAGE_PATH,
  PROFILE,
} from '../src/test-data.ts';
import { expect, test } from './fixtures.ts';
import { knowPlayer } from './player-api.ts';

test('explains that the server is down, then shows the profile once it is back', async ({
  page,
  api,
}) => {
  knowPlayer(api);
  // What Caddy (or Vite in development) answers when the API is not running.
  api.answer(PLAYER_API_PATH, undefined, { status: 502 });

  await page.goto(PLAYER_PAGE_PATH);

  await expect(page.getByRole('alert')).toHaveText(
    "The profile could not be loaded. The server or Riot's servers are not answering right now. Try again in a moment.",
  );
  api.answer(PLAYER_API_PATH, PROFILE);
  await page.getByRole('button', { name: 'Try again' }).click();

  await expect(page.getByText('Korea · Level 812')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('says when no player has the Riot ID, with the search form ready to correct it', async ({
  page,
  api,
}) => {
  const notFound = { statusCode: 404, message: 'No player with this Riot ID' };
  api.answer(PLAYER_API_PATH, notFound, { status: 404 });
  api.answer(`${PLAYER_API_PATH}/matches?start=0`, notFound, { status: 404 });
  api.answer('/api/v1/static-data', undefined, { status: 404 });

  await page.goto(PLAYER_PAGE_PATH);

  await expect(
    page.getByRole('heading', { name: 'Player not found' }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Riot ID', exact: true }),
  ).toHaveValue('Hide on bush#KR1');
  await expect(
    page.getByRole('combobox', { name: 'Region', exact: true }),
  ).toHaveValue('kr');
});

test.describe('"Update" button', () => {
  test.beforeEach(async ({ page }) => {
    // The countdown stays still: the page's clock is stopped (its timers still run).
    await page.clock.setFixedTime(new Date('2026-10-04T12:00:00Z'));
  });

  test('updates the player, then counts down to the next update', async ({
    page,
    api,
  }) => {
    knowPlayer(api);
    api.answer(`${PLAYER_API_PATH}/refresh`, undefined, {
      status: 204,
      method: 'POST',
    });
    await page.goto(PLAYER_PAGE_PATH);
    await expect(page.getByText('Korea · Level 812')).toBeVisible();

    // Riot's data changed since the last lookup.
    api.answer(PLAYER_API_PATH, { ...PROFILE, summonerLevel: 813 });
    await page.getByRole('button', { name: 'Update' }).click();

    await expect(page.getByText('Korea · Level 813')).toBeVisible();
    await expect(page.getByText('Updated.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Update in 2:00' }),
    ).toBeDisabled();
  });

  test('counts down the delay given by the API when the player was updated recently', async ({
    page,
    api,
  }) => {
    knowPlayer(api);
    api.answer(
      `${PLAYER_API_PATH}/refresh`,
      { message: 'This player was updated less than 2 minutes ago' },
      { status: 429, headers: { 'Retry-After': '111' }, method: 'POST' },
    );
    await page.goto(PLAYER_PAGE_PATH);

    await page.getByRole('button', { name: 'Update' }).click();

    await expect(
      page.getByText('This player was updated recently.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Update in 1:51' }),
    ).toBeDisabled();
  });
});

test("shows Riot's legal notice", async ({ page, api }) => {
  api.answer('/api/health', { status: 'ok' });

  await page.goto('/');

  await expect(page.getByRole('contentinfo')).toContainText(
    "statslol isn't endorsed by Riot Games",
  );
});
