import { Link } from 'react-router';

import { Panel } from '../components/Panel.tsx';

export function NotFoundPage() {
  return (
    <Panel>
      <h1>Page not found</h1>
      <p>
        There is nothing at this address.{' '}
        <Link to="/">Back to the home page</Link>
      </p>
    </Panel>
  );
}
