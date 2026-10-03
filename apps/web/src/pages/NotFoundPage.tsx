import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <>
      <h1>Page not found</h1>
      <p>
        There is nothing at this address.{' '}
        <Link to="/">Back to the home page</Link>
      </p>
    </>
  );
}
