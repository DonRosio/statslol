import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { routes } from './routes.ts';

/**
 * Renders the app as if the browser had opened `path`. The router lets a test go to another
 * page, as a link would: `await act(() => router.navigate('/...'))`.
 */
export function renderPage(path: string) {
  // A new cache for each test, without retries: a failure shows at once.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...result, router };
}

/** Waits for the list of matches, then returns its items. */
export async function findMatches(): Promise<HTMLElement[]> {
  const list = await screen.findByRole('list');
  return within(list).getAllByRole('listitem');
}

/** The item at `index`, or a failed test if there is none. */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`No item at index ${String(index)}`);
  }
  return item;
}
