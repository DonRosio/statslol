import type { PlayerProfile, Rank } from '@statslol/shared';
import { useId } from 'react';

import { formatTier, winRate } from '../format.ts';
import styles from './RankCards.module.css';

/** The player's rank in each ranked queue. */
export function RankCards({ ranks }: { ranks: PlayerProfile['ranks'] }) {
  return (
    <div className={styles.cards}>
      <RankCard title="Ranked Solo/Duo" rank={ranks.solo} />
      <RankCard title="Ranked Flex" rank={ranks.flex} />
    </div>
  );
}

function RankCard({ title, rank }: { title: string; rank: Rank | null }) {
  const titleId = useId();
  const rate = rank === null ? null : winRate(rank.wins, rank.losses);
  return (
    // A section named by its title: screen readers list it among the regions of the page.
    <section className={styles.card} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {rank === null ? (
        <p className={styles.unranked}>Unranked</p>
      ) : (
        <>
          <p className={styles.tier}>
            {formatTier(rank)} · {rank.leaguePoints} LP
          </p>
          <p className={styles.record}>
            {rank.wins}W {rank.losses}L
            {rate !== null && ` · ${String(rate)}% win rate`}
          </p>
        </>
      )}
    </section>
  );
}
