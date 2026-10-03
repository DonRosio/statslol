import type { RouteObject } from 'react-router';

import { Layout } from './Layout.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { PLAYER_PATH } from './player-path.ts';

/** Pages of the app, by URL. */
export const routes: RouteObject[] = [
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      { path: PLAYER_PATH, Component: ProfilePage },
      { path: '*', Component: NotFoundPage },
    ],
  },
];
