import type { PlayerParams } from '@statslol/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useId } from 'react';

import { matchHistoryQuery, uniqueMatches } from '../api/players.ts';
import { describeError } from '../api/errors.ts';
import { useStaticData } from '../api/static-data.ts';
import { RECENT_GAMES, recentStats } from '../recent-stats.ts';
import { ErrorMessage } from './ErrorMessage.tsx';
import styles from './MatchHistory.module.css';
import { MatchCard } from './MatchCard.tsx';
import { RecentSummary } from './RecentSummary.tsx';

/** The latest matches of a player, and a button to load older ones. */
export function MatchHistory({ player }: { player: PlayerParams }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.box}>
      {/* The summary and the matches say what this is: the title is only for screen readers. */}
      <h2 id={headingId} className="visually-hidden">
        Match history
      </h2>
      <MatchList player={player} />
    </section>
  );
}

function MatchList({ player }: { player: PlayerParams }) {
  const history = useInfiniteQuery(matchHistoryQuery(player));
  const staticData = useStaticData();

  // The summary counts the last 20 games: the second page is loaded without waiting for
  // "Show more". Only when nothing else is loading: after an update, the first page is
  // fetched again first, and this must not cut it short. Once: if the second page fails,
  // the button below tries again.
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } =
    history;
  const pageCount = history.data?.pages.length ?? 0;
  useEffect(() => {
    if (
      pageCount === 1 &&
      hasNextPage &&
      !isFetching &&
      !isFetchNextPageError
    ) {
      void fetchNextPage();
    }
  }, [pageCount, hasNextPage, isFetching, isFetchNextPageError, fetchNextPage]);

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
  // The 20 games are there, or there are no more to wait for.
  const summaryReady =
    matches.length >= RECENT_GAMES || !hasNextPage || isFetchNextPageError;
  return (
    <>
      {matches.length > 0 &&
        (summaryReady ? (
          <RecentSummary stats={recentStats(matches)} staticData={staticData} />
        ) : (
          <SummaryPlaceholder />
        ))}
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

/** A grey block in place of the summary, while the second page of matches loads. */
function SummaryPlaceholder() {
  return (
    <div
      className={['skeleton', styles.summaryPlaceholder].join(' ')}
      aria-hidden="true"
    />
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
