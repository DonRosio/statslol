import type { PlayerProfile, Rank } from '@statslol/shared';
import { useId } from 'react';

import { formatTier, winRate } from '../format.ts';
import styles from './RankCards.module.css';
import { WinRate } from './WinRate.tsx';

/** The player's rank in each ranked queue; grey bars while the profile loads (undefined). */
export function RankCards({
  ranks,
}: {
  ranks: PlayerProfile['ranks'] | undefined;
}) {
  return (
    <div className={styles.cards}>
      <RankCard title="Ranked Solo/Duo" rank={ranks?.solo} />
      <RankCard title="Ranked Flex" rank={ranks?.flex} />
    </div>
  );
}

function RankCard({
  title,
  rank,
}: {
  title: string;
  rank: Rank | null | undefined;
}) {
  const titleId = useId();
  return (
    // A section named by its title: screen readers list it among the regions of the page.
    <section className={styles.card} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <RankDetails rank={rank} />
    </section>
  );
}

/** The rank in one queue: null when unranked, undefined while the profile loads. */
function RankDetails({ rank }: { rank: Rank | null | undefined }) {
  if (rank === undefined) {
    return <div className={['skeleton', styles.placeholder].join(' ')} />;
  }
  if (rank === null) {
    return <p className={styles.unranked}>Unranked</p>;
  }
  const rate = winRate(rank.wins, rank.losses);
  return (
    <>
      <p className={styles.tier}>
        {formatTier(rank)} · {rank.leaguePoints} LP
      </p>
      <p className={styles.record}>
        {rank.wins}W {rank.losses}L
        {rate !== null && (
          <>
            {' · '}
            <WinRate rate={rate} /> win rate
          </>
        )}
      </p>
    </>
  );
}
