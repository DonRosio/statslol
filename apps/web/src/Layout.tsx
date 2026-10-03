import { Link, Outlet } from 'react-router';

/** Frame shared by every page: the header, then the page of the current URL. */
export function Layout() {
  return (
    <>
      <header className="site-header">
        <Link to="/" className="site-name">
          statslol
        </Link>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
