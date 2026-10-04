import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { delay, HttpResponse, type HttpResponseResolver } from 'msw';
import { describe, expect, it } from 'vitest';

import { failure, matchPages, mockPlayerApi } from '../test-api.ts';
import { matchSummary, PLAYER_PAGE_PATH, PROFILE } from '../test-data.ts';
import { findMatches, renderPage } from '../test-utils.tsx';

/** Answers `first` to the first request, then `then` to the next ones. */
function firstThen(
  first: HttpResponseResolver,
  then: HttpResponseResolver,
): HttpResponseResolver {
  let calls = 0;
  return (info) => {
    calls += 1;
    return calls === 1 ? first(info) : then(info);
  };
}

const notFound = () =>
  HttpResponse.json(
    { statusCode: 404, message: 'No player with this Riot ID on this region' },
    { status: 404 },
  );

describe('profile page, when a player cannot be shown', () => {
  it('says that the player does not exist, with the search form ready to correct it', async () => {
    mockPlayerApi({ profile: notFound, matches: notFound });

    renderPage(PLAYER_PAGE_PATH);

    expect(
      await screen.findByRole('heading', { name: 'Player not found' }),
    ).toBeDefined();
    expect(
      screen.getByText(/^No League of Legends player has the Riot ID/)
        .textContent,
    ).toBe(
      'No League of Legends player has the Riot ID Hide on bush#KR1 on Korea. Check the name, the tag after the # and the region.',
    );
    expect(screen.getByRole('textbox', { name: 'Riot ID' })).toHaveProperty(
      'value',
      'Hide on bush#KR1',
    );
    expect(screen.getByRole('combobox', { name: 'Region' })).toHaveProperty(
      'value',
      'kr',
    );
    // Nothing to update, no matches to show.
    expect(screen.queryByRole('button', { name: /^Update/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Match history' })).toBeNull();
  });

  it('opens the corrected Riot ID, with a form filled for it', async () => {
    mockPlayerApi({ profile: notFound, matches: notFound });
    renderPage(PLAYER_PAGE_PATH);
    const field = await screen.findByRole('textbox', { name: 'Riot ID' });
    const user = userEvent.setup();

    await user.clear(field);
    await user.type(field, 'Hide on bush#KR2');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Hide on bush#KR2' }),
    ).toBeDefined();
    expect(
      await screen.findByRole('textbox', { name: 'Riot ID' }),
    ).toHaveProperty('value', 'Hide on bush#KR2');
  });

  it.each([
    [
      'is down',
      () => new HttpResponse(null, { status: 502 }),
      "The server or Riot's servers are not answering right now. Try again in a moment.",
    ],
    [
      'cannot reach Riot for a while',
      () =>
        HttpResponse.json(
          { message: 'Riot is unavailable' },
          { status: 503, headers: { 'Retry-After': '30' } },
        ),
      "The server or Riot's servers are not answering right now. Try again in 30 seconds.",
    ],
    [
      'gets too many requests from this visitor',
      () =>
        new HttpResponse(null, {
          status: 429,
          headers: { 'Retry-After': '60' },
        }),
      'Too many requests from your connection. Try again in 1:00.',
    ],
    [
      'fails',
      failure,
      'Something went wrong on our side. Try again in a moment.',
    ],
    [
      'cannot be reached',
      () => HttpResponse.error(),
      'The server cannot be reached. Check your connection, then try again.',
    ],
  ])(
    'explains why the profile could not be loaded when the API %s',
    async (_case, answer, explanation) => {
      mockPlayerApi({ profile: answer });

      renderPage(PLAYER_PAGE_PATH);

      expect((await screen.findByRole('alert')).textContent).toBe(
        `The profile could not be loaded. ${explanation}`,
      );
      expect(
        screen.queryByRole('heading', { name: 'Match history' }),
      ).toBeNull();
    },
  );

  it('loads the profile again with "Try again"', async () => {
    mockPlayerApi({
      profile: firstThen(failure, () => HttpResponse.json(PROFILE)),
    });
    renderPage(PLAYER_PAGE_PATH);

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Korea · Level 812')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await findMatches()).toHaveLength(2);
  });

  it('explains why the matches could not be loaded, and loads them again', async () => {
    mockPlayerApi({
      matches: firstThen(
        failure,
        matchPages({ 0: { matches: [matchSummary('KR_1')], nextStart: null } }),
      ),
    });
    renderPage(PLAYER_PAGE_PATH);

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The match history could not be loaded. Something went wrong on our side. Try again in a moment.',
    );
    // The profile is shown all the same.
    expect(screen.getByText('Korea · Level 812')).toBeDefined();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Try again' }));

    expect(await findMatches()).toHaveLength(1);
  });

  it('explains why older matches could not be loaded; "Show more" tries again', async () => {
    mockPlayerApi({
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
      'More matches could not be loaded. Something went wrong on our side. Try again in a moment.',
    );
    expect(screen.getByRole('button', { name: 'Show more' })).toBeDefined();
  });

  it('shows the profile while the API is slow to answer the matches', async () => {
    mockPlayerApi({ matches: () => delay('infinite') });

    renderPage(PLAYER_PAGE_PATH);

    expect(await screen.findByText('Korea · Level 812')).toBeDefined();
    expect(screen.getByText('Loading the matches…')).toBeDefined();
  });
});
