import type { MatchSummary, PlayerParams, StaticData } from '@statslol/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useId } from 'react';

import { matchHistoryQuery, uniqueMatches } from '../api/players.ts';
import { describeError } from '../api/errors.ts';
import { useStaticData } from '../api/static-data.ts';
import { championImageUrl, findChampion } from '../data-dragon.ts';
import {
  formatCsPerMinute,
  formatDateTime,
  formatDuration,
  formatKdaRatio,
  formatResult,
  formatTimeAgo,
  positionName,
} from '../format.ts';
import { queueName } from '../queues.ts';
import { ErrorMessage } from './ErrorMessage.tsx';
import { GameImage } from './GameImage.tsx';
import styles from './MatchHistory.module.css';

const CHAMPION_IMAGE_SIZE = 48;

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
            <MatchItem
              key={match.id}
              match={match}
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

interface MatchItemProps {
  readonly match: MatchSummary;
  readonly staticData: StaticData | undefined;
  readonly now: number;
}

function MatchItem({ match, staticData, now }: MatchItemProps) {
  const champion =
    staticData === undefined
      ? undefined
      : findChampion(staticData, match.championId);
  const position = positionName(match.position);

  return (
    <li className={styles.match} data-result={match.result}>
      <GameImage
        src={
          staticData === undefined || champion === undefined
            ? null
            : championImageUrl(staticData.version, champion)
        }
        size={CHAMPION_IMAGE_SIZE}
        className={styles.champion}
        fallback={<span className={styles.champion} />}
      />
      <div className={styles.details}>
        <div>
          <p className={styles.result}>{formatResult(match)}</p>
          <p className={styles.muted}>{queueName(match.queueId)}</p>
        </div>
        <div>
          {/* Data Dragon's name ("Wukong"), or else Riot's internal one ("MonkeyKing"). */}
          <p className={styles.strong}>
            {champion?.name ?? match.championName}
          </p>
          {position !== null && <p className={styles.muted}>{position}</p>}
        </div>
        <div>
          <p className={styles.strong}>
            <span className="visually-hidden">Kills, deaths, assists: </span>
            {match.kills} / {match.deaths} / {match.assists}
          </p>
          <p className={styles.muted}>
            {formatKdaRatio(match.kills, match.deaths, match.assists)} KDA
          </p>
        </div>
        <div>
          <p>
            {match.creepScore} CS (
            {formatCsPerMinute(match.creepScore, match.durationSeconds)}/min)
          </p>
          <p className={styles.muted}>
            <time
              dateTime={match.startedAt}
              title={formatDateTime(match.startedAt)}
            >
              {formatTimeAgo(match.startedAt, now)}
            </time>
            {' · '}
            {formatDuration(match.durationSeconds)}
          </p>
        </div>
      </div>
    </li>
  );
}
