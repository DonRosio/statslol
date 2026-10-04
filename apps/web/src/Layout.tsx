import { Link, Outlet } from 'react-router';

import styles from './Layout.module.css';

/** Frame shared by every page: the header, then the page of the current URL. */
export function Layout() {
  return (
    <>
      <header className={styles.header}>
        <Link to="/" className={styles.siteName}>
          statslol
        </Link>
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
