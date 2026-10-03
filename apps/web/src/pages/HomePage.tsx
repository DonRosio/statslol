import { ApiStatus } from '../components/ApiStatus.tsx';

export function HomePage() {
  return (
    <>
      <h1>League of Legends stats</h1>
      <p>Look up a player by Riot ID: profile, rank and match history.</p>
      <ApiStatus />
    </>
  );
}
