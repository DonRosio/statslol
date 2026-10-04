import { test as base, expect, type Page } from '@playwright/test';

// The tiniest valid PNG image (1 × 1 pixel, grey): the answer of the fake Data Dragon.
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNoaGgAAAMEAYFL09IQAAAAAElFTkSuQmCC',
  'base64',
);

interface Answer {
  readonly body: unknown;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * A fake API: answers set by each test, by method, path and query string
 * (e.g. "GET /api/v1/players/...?start=0").
 */
export class FakeApi {
  readonly #answers = new Map<string, Answer>();
  /** Requests to the API that no test expected: each one fails the test. */
  readonly unexpectedRequests: string[] = [];

  /**
   * From now on, the API answers `body` (as JSON; nothing if undefined) to `path`, with a
   * 200 status unless `options` say otherwise.
   */
  answer(
    path: string,
    body: unknown,
    {
      status = 200,
      headers = {},
      method = 'GET',
    }: {
      status?: number;
      headers?: Readonly<Record<string, string>>;
      method?: 'GET' | 'POST';
    } = {},
  ): void {
    this.#answers.set(`${method} ${path}`, { body, status, headers });
  }

  async install(page: Page): Promise<void> {
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const request = `${route.request().method()} ${url.pathname}${url.search}`;
      const answer = this.#answers.get(request);
      if (answer === undefined) {
        this.unexpectedRequests.push(request);
        await route.fulfill({ status: 500 });
        return;
      }
      const { body, status, headers } = answer;
      await route.fulfill(
        body === undefined
          ? { status, headers }
          : { status, headers, json: body },
      );
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
