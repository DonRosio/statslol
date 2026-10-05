import type { RouteObject } from 'react-router';

import { Layout } from './Layout.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { ProfileArena } from './pages/ProfileArena.tsx';
import { ProfileOverview } from './pages/ProfileOverview.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { PLAYER_PATH } from './player-path.ts';

/** Pages of the app, by URL. */
export const routes: RouteObject[] = [
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      {
        path: PLAYER_PATH,
        Component: ProfilePage,
        // One child for each tab of PROFILE_TABS, the first one being the profile itself.
        children: [
          { index: true, Component: ProfileOverview },
          { path: 'arena', Component: ProfileArena },
        ],
      },
      { path: '*', Component: NotFoundPage },
    ],
  },
];
