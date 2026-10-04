import type { PlayerParams } from '@statslol/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useId } from 'react';

import { matchHistoryQuery, uniqueMatches } from '../api/players.ts';
import { describeError } from '../api/errors.ts';
import { useStaticData } from '../api/static-data.ts';
import { ErrorMessage } from './ErrorMessage.tsx';
import styles from './MatchHistory.module.css';
import { MatchCard } from './MatchCard.tsx';

/** The latest matches of a player, and a button to load older ones. */
export function MatchHistory({ player }: { player: PlayerParams }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.title}>
        Match history
      </h2>
      <MatchList player={player} />
    </section>
  );
}

function MatchList({ player }: { player: PlayerParams }) {
  const history = useInfiniteQuery(matchHistoryQuery(player));
  const staticData = useStaticData();

  if (history.data === undefined) {
    return history.error === null ? (
      <MatchListPlaceholder />
    ) : (
      <ErrorMessage
        title="The match history could not be loaded."
        error={history.error}
        onRetry={() => {
          void history.refetch();
        }}
        retrying={history.isFetching}
      />
    );
  }
  const matches = uniqueMatches(history.data.pages);
  return (
    <>
      {matches.length === 0 ? (
        <p>No matches yet.</p>
      ) : (
        <ol className={styles.list}>
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              player={player}
              staticData={staticData}
              // When the matches were loaded: "2 hours ago" is counted from then.
              now={history.dataUpdatedAt}
            />
          ))}
        </ol>
      )}
      {history.isFetchNextPageError && (
        // The "Show more" button below tries again.
        <p role="alert">
          More matches could not be loaded. {describeError(history.error)}
        </p>
      )}
      {history.hasNextPage && (
        <button
          type="button"
          className={styles.more}
          disabled={history.isFetchingNextPage}
          onClick={() => {
            void history.fetchNextPage();
          }}
        >
          {history.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </button>
      )}
    </>
  );
}

/** Grey blocks in place of the first matches, while they load. */
function MatchListPlaceholder() {
  return (
    <>
      <p role="status" className="visually-hidden">
        Loading the matches…
      </p>
      <div className={styles.list} aria-hidden="true">
        {[1, 2, 3].map((index) => (
          <div
            key={index}
            className={['skeleton', styles.placeholder].join(' ')}
          />
        ))}
      </div>
    </>
  );
}
