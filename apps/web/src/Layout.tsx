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
    </>
  );
}
