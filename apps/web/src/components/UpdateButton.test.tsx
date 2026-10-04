import { act, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { failure, matchPages, mockPlayerApi } from '../test-api.ts';
import { matchSummary, PLAYER_PAGE_PATH, PROFILE } from '../test-data.ts';
import { recordRequests } from '../test-server.ts';
import { renderPage } from '../test-utils.tsx';

/** Stops the clock of the page (Date only: the other timers still run). */
function freezeClock() {
  vi.useFakeTimers({ toFake: ['Date'] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
}

function updateButton() {
  // "Update", "Updating…" or "Update in 1:51".
  return screen.getByRole('button', { name: /^Updat/ });
}

async function clickUpdate() {
  await screen.findByText('Korea · Level 812');
  await userEvent.setup().click(updateButton());
}

describe('"Update" button', () => {
  it('updates the player, then shows the fresh data', async () => {
    freezeClock();
    let updated = false;
    mockPlayerApi({
      profile: () =>
        HttpResponse.json({ ...PROFILE, summonerLevel: updated ? 813 : 812 }),
      refresh: () => {
        updated = true;
        return new HttpResponse(null, { status: 204 });
      },
    });
    renderPage(PLAYER_PAGE_PATH);

    await clickUpdate();

    expect(await screen.findByText('Korea · Level 813')).toBeDefined();
    expect(screen.getByText('Updated.')).toBeDefined();
    // The API refuses a new update for 2 minutes: the button counts them down.
    expect(updateButton().textContent).toBe('Update in 2:00');
    expect(updateButton()).toHaveProperty('disabled', true);
  });

  it('starts again from the first pages of matches, without asking for the older ones', async () => {
    mockPlayerApi({
      matches: matchPages({
        0: { matches: [matchSummary('KR_5')], nextStart: 1 },
        1: { matches: [matchSummary('KR_4')], nextStart: 2 },
        2: { matches: [matchSummary('KR_3')], nextStart: null },
      }),
    });
    renderPage(PLAYER_PAGE_PATH);
    // The second page comes by itself, the third with "Show more".
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Show more' }));
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });
    const requests = recordRequests();

    await clickUpdate();

    // The first page, and the second one again for the summary: not the third.
    await waitFor(() => {
      expect(requests.filter((path) => path.endsWith('/matches'))).toHaveLength(
        2,
      );
    });
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });
    expect(screen.getByRole('button', { name: 'Show more' })).toBeDefined();
  });

  it('counts down the delay given by the API when the player was updated recently', async () => {
    freezeClock();
    mockPlayerApi({
      refresh: () =>
        HttpResponse.json(
          { message: 'This player was updated less than 2 minutes ago' },
          { status: 429, headers: { 'Retry-After': '111' } },
        ),
    });
    renderPage(PLAYER_PAGE_PATH);

    await clickUpdate();

    expect(
      await screen.findByText('This player was updated recently.'),
    ).toBeDefined();
    expect(updateButton().textContent).toBe('Update in 1:51');
    expect(updateButton()).toHaveProperty('disabled', true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains a failed update, and can be used again at once', async () => {
    mockPlayerApi({ refresh: failure });
    renderPage(PLAYER_PAGE_PATH);

    await clickUpdate();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The update failed. Something went wrong on our side. Try again in a moment.',
    );
    expect(updateButton().textContent).toBe('Update');
    expect(updateButton()).toHaveProperty('disabled', false);
  });

  it("does not carry a player's countdown to the profile of another player", async () => {
    freezeClock();
    mockPlayerApi();
    const otherPlayer = '/players/kr/Faker/KR1';
    // The other player was looked up first: going back to them shows their profile at once.
    const { router } = renderPage(otherPlayer);
    await screen.findByText('Korea · Level 812');
    await act(() => router.navigate(PLAYER_PAGE_PATH));
    await clickUpdate();
    expect(
      await screen.findByRole('button', { name: 'Update in 2:00' }),
    ).toBeDefined();

    await act(() => router.navigate(otherPlayer));

    expect(updateButton().textContent).toBe('Update');
    expect(screen.queryByText('Updated.')).toBeNull();
  });

  it('says "Updating…" while the update is on its way', async () => {
    // Answers the update request, once it is sent.
    let finish: (() => void) | undefined;
    mockPlayerApi({
      refresh: () =>
        new Promise((resolve) => {
          finish = () => {
            resolve(new HttpResponse(null, { status: 204 }));
          };
        }),
    });
    renderPage(PLAYER_PAGE_PATH);

    await clickUpdate();

    expect(updateButton().textContent).toBe('Updating…');
    expect(updateButton()).toHaveProperty('disabled', true);
    finish?.();
    expect(await screen.findByText('Updated.')).toBeDefined();
  });
});
