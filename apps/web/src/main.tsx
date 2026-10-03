import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { createQueryClient } from './query-client.ts';
import { routes } from './routes.ts';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('index.html has no element with id "root"');
}

// Created once, outside of React: re-rendering the app must not reset them.
const router = createBrowserRouter(routes);
const queryClient = createQueryClient();

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
