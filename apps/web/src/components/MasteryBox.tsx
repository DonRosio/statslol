import { championStats, type ChampionStats } from '@statslol/core';
import {
  currentSeason,
  type ChampionMastery,
  type ChampionRecord,
  type PlayerMastery,
  type PlayerParams,
  type StaticData,
} from '@statslol/shared';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { championStatsQuery, masteryQuery } from '../api/players.ts';
import { useStaticData } from '../api/static-data.ts';
import { matchesSearch, queueIdsOf } from '../champion-filters.ts';
import { findChampion } from '../data-dragon.ts';
import { formatKdaRatio, formatNumber, formatTimeAgo } from '../format.ts';
import { ChampionIcon } from './ChampionIcon.tsx';
import { ErrorMessage } from './ErrorMessage.tsx';
import { MasteryEmblem } from './MasteryEmblem.tsx';
import { WinRate } from './WinRate.tsx';
import styles from './MasteryBox.module.css';

/** The champion's icon, and the height of the emblem beside it. */
const ICON_SIZE = 60;

/** How many champions are listed before "Show all": a player has more than a hundred. */
const FIRST_CHAMPIONS = 30;

/**
 * The "Mastery" tab: the mastery score and the points of the player, then a card for each
 * champion played, the most points first: its level, its points, its last game, and what the
 * player did with it in the season (from the games the site has loaded).
 */
export function MasteryBox({ player }: { player: PlayerParams }) {
  const headingId = useId();
  const mastery = useQuery(masteryQuery(player));
  // Only read: opening this tab does not start the loading of the season (the Champions tab
  // does). The numbers of the cards are those of the games the site has so far.
  const season = currentSeason(new Date());
  const seasonStats = useQuery(championStatsQuery(player, season.id));
  const staticData = useStaticData();

  let content;
  if (mastery.data !== undefined) {
    content = (
      <Mastery
        mastery={mastery.data}
        now={mastery.dataUpdatedAt}
        seasonLabel={season.label}
        seasonRecords={seasonStats.data?.records}
        staticData={staticData}
      />
    );
  } else if (mastery.error !== null) {
    content = (
      <ErrorMessage
        title="The mastery could not be loaded."
        error={mastery.error}
        onRetry={() => {
          void mastery.refetch();
        }}
        retrying={mastery.isFetching}
      />
    );
  } else {
    content = (
      <>
        <p role="status" className="visually-hidden">
          Loading the mastery…
        </p>
        <div className={['skeleton', styles.placeholder].join(' ')} />
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} className={styles.box}>
      <h2 id={headingId} className="visually-hidden">
        Champion mastery
      </h2>
      {content}
    </section>
  );
}

function Mastery({
  mastery,
  now,
  seasonLabel,
  seasonRecords,
  staticData,
}: {
  readonly mastery: PlayerMastery;
  readonly now: number;
  readonly seasonLabel: string;
  /** Undefined until the statistics of the season arrive (or if they cannot). */
  readonly seasonRecords: readonly ChampionRecord[] | undefined;
  readonly staticData: StaticData | undefined;
}) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  if (mastery.champions.length === 0) {
    return <p className={styles.empty}>This player has no champion mastery.</p>;
  }

  const nameOf = (champion: ChampionMastery) =>
    (staticData === undefined
      ? undefined
      : findChampion(staticData, champion.championId)?.name) ??
    `Champion ${String(champion.championId)}`;

  // The season of each champion, all the modes but Arena (as the "All" of the Champions tab).
  const seasonByChampion =
    seasonRecords === undefined
      ? undefined
      : new Map(
          championStats(seasonRecords, {
            queueIds: queueIdsOf('all', seasonRecords),
          }).map((stats) => [stats.championId, stats]),
        );

  const found = mastery.champions.filter((champion) =>
    matchesSearch(nameOf(champion), search),
  );
  // A search shows every match: the list is only cut when it is not searched.
  const listed =
    showAll || search.trim() !== '' ? found : found.slice(0, FIRST_CHAMPIONS);

  return (
    <>
      <div className={styles.summary}>
        <p>
          <strong className={styles.figure}>
            {formatNumber(mastery.score)}
          </strong>{' '}
          <span className={styles.small}>mastery score</span>
        </p>
        <p>
          <strong className={styles.figure}>
            {formatNumber(mastery.totalPoints)}
          </strong>{' '}
          <span className={styles.small}>points</span>
        </p>
        <p>
          <strong className={styles.figure}>
            {formatNumber(mastery.champions.length)}
          </strong>{' '}
          <span className={styles.small}>champions</span>
        </p>
        <input
          type="search"
          aria-label="Search a champion"
          placeholder="Search a champion"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </div>
      {found.length === 0 ? (
        <p className={styles.empty}>No champion matches this search.</p>
      ) : (
        <ul aria-label="Champion mastery" className={styles.cards}>
          {listed.map((champion) => (
            <MasteryCard
              key={champion.championId}
              champion={champion}
              name={nameOf(champion)}
              now={now}
              seasonLabel={seasonLabel}
              season={seasonByChampion?.get(champion.championId)}
              seasonKnown={seasonByChampion !== undefined}
              staticData={staticData}
            />
          ))}
        </ul>
      )}
      {!showAll && search.trim() === '' && found.length > listed.length && (
        <button
          type="button"
          className={styles.more}
          onClick={() => {
            setShowAll(true);
          }}
        >
          Show all {formatNumber(found.length)} champions
        </button>
      )}
    </>
  );
}

function MasteryCard({
  champion,
  name,
  now,
  seasonLabel,
  season,
  seasonKnown,
  staticData,
}: {
  readonly champion: ChampionMastery;
  readonly name: string;
  readonly now: number;
  readonly seasonLabel: string;
  /** What the player did with the champion this season; undefined if nothing is known. */
  readonly season: ChampionStats | undefined;
  /** Whether the statistics of the season arrived: a line is only shown once they have. */
  readonly seasonKnown: boolean;
  readonly staticData: StaticData | undefined;
}) {
  return (
    <li className={styles.card}>
      {/* The icon and the emblem, as high as the three lines on their right: the name, the
          points, the last game. */}
      <div className={styles.top}>
        <ChampionIcon
          championId={champion.championId}
          championName={name}
          staticData={staticData}
          size={ICON_SIZE}
          badge={champion.level}
        />
        <MasteryEmblem level={champion.level} height={ICON_SIZE} />
        <div className={styles.info}>
          <p className={styles.name}>{name}</p>
          <p className={styles.points}>{formatNumber(champion.points)}</p>
          <p className={styles.small}>
            {champion.lastPlayedAt === null
              ? '–'
              : formatTimeAgo(champion.lastPlayedAt, now)}
          </p>
        </div>
      </div>
      {seasonKnown && (
        <div className={styles.season}>
          {season === undefined ? (
            <p>No game in {seasonLabel}</p>
          ) : (
            <>
              <p>
                {seasonLabel} - {season.games}{' '}
                {season.games === 1 ? 'game' : 'games'} -{' '}
                {formatKdaRatio(season.kills, season.deaths, season.assists)}{' '}
                KDA
              </p>
              <p>
                Winrate : <WinRate rate={season.winRate} /> - {season.wins}W/
                {season.losses}L
              </p>
            </>
          )}
        </div>
      )}
    </li>
  );
}
