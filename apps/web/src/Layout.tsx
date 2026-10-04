import { regionSchema } from '@statslol/shared';
import { Link, Outlet, useLocation, useMatch } from 'react-router';

import { SearchForm } from './components/SearchForm.tsx';
import styles from './Layout.module.css';
import { PLAYER_PATH } from './player-path.ts';

/** Frame shared by every page: the header, then the page of the current URL. */
export function Layout() {
  const { pathname } = useLocation();
  // On a player's page, a new search starts on the same server.
  const profile = useMatch(PLAYER_PATH);
  const profileRegion = regionSchema.safeParse(profile?.params.region);
  return (
    <>
      <header className={styles.header}>
        <nav aria-label="Main">
          <Link to="/" className={styles.siteName}>
            statslol
          </Link>
        </nav>
        {/* The home page is a search form already. */}
        {pathname !== '/' && (
          <div className={styles.search}>
            {/* One form per page: a new page starts with an empty field and its server. */}
            <SearchForm
              key={pathname}
              compact
              initialRegion={
                profileRegion.success ? profileRegion.data : undefined
              }
            />
          </div>
        )}
      </header>
      <main>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        {/* Riot's policies require this notice, word for word, on every page. */}
        <p>
          statslol isn't endorsed by Riot Games and doesn't reflect the views or
          opinions of Riot Games or anyone officially involved in producing or
          managing Riot Games properties. Riot Games, and all associated
          properties are trademarks or registered trademarks of Riot Games, Inc.
        </p>
      </footer>
    </>
  );
}
