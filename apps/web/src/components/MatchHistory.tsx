import { MATCHES_PER_PAGE, type PlayerParams } from '@statslol/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useId } from 'react';

import { matchHistoryQuery, uniqueMatches } from '../api/players.ts';
import { describeError } from '../api/errors.ts';
import { useStaticData } from '../api/static-data.ts';
import { isArenaGame } from '../queues.ts';
import { RECENT_GAMES, recentStats } from '../recent-stats.ts';
import { ErrorMessage } from './ErrorMessage.tsx';
import styles from './MatchHistory.module.css';
import { MatchCard } from './MatchCard.tsx';
import { RecentSummary } from './RecentSummary.tsx';

/**
 * Which games a history shows: the overview has the usual games (5v5, ARAM...) and a summary of
 * them; the Arena tab has the Arena games, which the overview leaves out.
 */
export type HistoryMode = 'overview' | 'arena';

/** How many games of the mode are wanted before "Show more": what the summary counts. */
const GAMES_WANTED: Record<HistoryMode, number> = {
  overview: RECENT_GAMES,
  arena: MATCHES_PER_PAGE,
};

/**
 * The most pages loaded without a click. A player who plays mostly something else has few
 * games of the mode in each page: more pages are loaded to find them, but not forever: every
 * match not seen before is a call to Riot.
 */
const MAX_AUTO_PAGES = 5;

/** The latest matches of a player, and a button to load older ones. */
export function MatchHistory({
  player,
  mode,
}: {
  player: PlayerParams;
  mode: HistoryMode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.box}>
      {/* The summary and the matches say what this is: the title is only for screen readers. */}
      <h2 id={headingId} className="visually-hidden">
        {mode === 'arena' ? 'Arena match history' : 'Match history'}
      </h2>
      <MatchList player={player} mode={mode} />
    </section>
  );
}

function MatchList({
  player,
  mode,
}: {
  player: PlayerParams;
  mode: HistoryMode;
}) {
  const history = useInfiniteQuery(matchHistoryQuery(player));
  const staticData = useStaticData();

  // The games of this mode, among all the matches loaded.
  const games = (
    history.data === undefined ? [] : uniqueMatches(history.data.pages)
  ).filter((match) => (mode === 'arena') === isArenaGame(match));
  const wanted = GAMES_WANTED[mode];

  // The next pages are loaded without waiting for "Show more", until the games wanted are
  // there. Only when nothing else is loading: after an update, the first page is fetched
  // again first, and this must not cut it short. Not after a failure: the button below tries
  // again.
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } =
    history;
  const pageCount = history.data?.pages.length ?? 0;
  const loadingMore =
    pageCount > 0 &&
    games.length < wanted &&
    hasNextPage &&
    pageCount < MAX_AUTO_PAGES &&
    !isFetchNextPageError;
  // The number of pages is a dependency too: when a page comes quickly, the loading state may
  // never be seen as "loading", and the effect must run again for the next page all the same.
  useEffect(() => {
    if (loadingMore && !isFetching) {
      void fetchNextPage();
    }
  }, [loadingMore, isFetching, pageCount, fetchNextPage]);

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
  return (
    <>
      {mode === 'overview' &&
        games.length > 0 &&
        (loadingMore ? (
          <SummaryPlaceholder />
        ) : (
          <RecentSummary stats={recentStats(games)} staticData={staticData} />
        ))}
      {games.length === 0 ? (
        loadingMore ? (
          <MatchListPlaceholder />
        ) : (
          <p>{mode === 'arena' ? 'No Arena games yet.' : 'No matches yet.'}</p>
        )
      ) : (
        <ol className={styles.list}>
          {games.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              player={player}
              staticData={staticData}
              // When the matches were loaded: "2h ago" is counted from then.
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
      {history.hasNextPage && !loadingMore && (
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
