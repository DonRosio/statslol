import { ApiStatus } from '../components/ApiStatus.tsx';
import { Panel } from '../components/Panel.tsx';
import { SearchForm } from '../components/SearchForm.tsx';

export function HomePage() {
  return (
    <Panel>
      <h1>League of Legends stats</h1>
      <p>Look up a player by Riot ID: profile, rank and match history.</p>
      <SearchForm />
      <ApiStatus />
    </Panel>
  );
}
