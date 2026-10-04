import { test as base, expect, type Page } from '@playwright/test';

// The tiniest valid PNG image (1 × 1 pixel, grey): the answer of the fake Data Dragon.
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNoaGgAAAMEAYFL09IQAAAAAElFTkSuQmCC',
  'base64',
);

/** A fake API: answers set by each test, by path + query string (e.g. /api/v1/...?start=0). */
export class FakeApi {
  readonly #answers = new Map<string, { status: number; body: unknown }>();
  /** Requests to the API that no test expected: each one fails the test. */
  readonly unexpectedRequests: string[] = [];

  /** The API answers `body` (as JSON) to GET `path`, with `status` (200 by default). */
  answer(path: string, body: unknown, status = 200): void {
    this.#answers.set(path, { status, body });
  }

  async install(page: Page): Promise<void> {
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const answer = this.#answers.get(url.pathname + url.search);
      if (answer === undefined) {
        this.unexpectedRequests.push(url.pathname + url.search);
        await route.fulfill({ status: 500 });
        return;
      }
      await route.fulfill({ status: answer.status, json: answer.body });
    });
  }
}

/**
 * `test` with two fakes, installed in the browser before each test (`auto`: even in the
 * tests that do not use `api`): the API, and Data Dragon, which answers a tiny image for
 * any file. No request leaves the machine.
 */
export const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, use) => {
      await page.route('https://ddragon.leagueoflegends.com/**', (route) =>
        route.fulfill({ contentType: 'image/png', body: PIXEL_PNG }),
      );
      const api = new FakeApi();
      await api.install(page);
      await use(api);
      expect(api.unexpectedRequests, 'requests no test expected').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
