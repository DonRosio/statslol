import type {
  ChampionRecord,
  PlayerParams,
  StaticData,
} from '@statslol/shared';
import { championStats, type ChampionStats } from '@statslol/core';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { championStatsQuery } from '../api/players.ts';
import { useStaticData } from '../api/static-data.ts';
import {
  matchesSearch,
  positionOptions,
  queueOptions,
} from '../champion-filters.ts';
import { findChampion } from '../data-dragon.ts';
import {
  formatAverage,
  formatAverageScore,
  formatCsPerMinute,
  formatKdaRatio,
  positionName,
} from '../format.ts';
import { ChampionIcon } from './ChampionIcon.tsx';
import styles from './ChampionStatsBox.module.css';
import { ErrorMessage } from './ErrorMessage.tsx';

/** The value of the "all" choice of the menus (no mode and no position is called this). */
const ALL = 'all';

/**
 * The "Champions" tab: what the player did with each champion, in a table, with menus to
 * keep one mode or one position and a search by name. Made from the matches stored on the
 * site (the ones the history loaded), which the box says: it is not the whole history.
 */
export function ChampionStatsBox({ player }: { player: PlayerParams }) {
  const headingId = useId();
  const stats = useQuery(championStatsQuery(player));
  const staticData = useStaticData();

  let content;
  if (stats.data !== undefined) {
    content = (
      <Champions records={stats.data.records} staticData={staticData} />
    );
  } else if (stats.error !== null) {
    content = (
      <ErrorMessage
        title="The champions could not be loaded."
        error={stats.error}
        onRetry={() => {
          void stats.refetch();
        }}
        retrying={stats.isFetching}
      />
    );
  } else {
    content = (
      <>
        <p role="status" className="visually-hidden">
          Loading the champions…
        </p>
        <div className={['skeleton', styles.placeholder].join(' ')} />
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} className={styles.box}>
      <h2 id={headingId} className="visually-hidden">
        Champions
      </h2>
      {content}
    </section>
  );
}

function Champions({
  records,
  staticData,
}: {
  readonly records: readonly ChampionRecord[];
  readonly staticData: StaticData | undefined;
}) {
  const [queue, setQueue] = useState(ALL);
  const [position, setPosition] = useState(ALL);
  const [search, setSearch] = useState('');

  if (records.length === 0) {
    return (
      <p className={styles.empty}>
        No game is stored for this player yet. The games of the Overview tab are
        counted here once they are loaded.
      </p>
    );
  }

  const queues = queueOptions(records);
  const positions = positionOptions(records);
  const selectedQueue = queues.find((option) => option.name === queue);
  const nameOf = (champion: ChampionStats) =>
    (staticData === undefined
      ? undefined
      : findChampion(staticData, champion.championId)?.name) ??
    champion.championName;

  const champions = championStats(records, {
    ...(selectedQueue !== undefined && { queueIds: selectedQueue.queueIds }),
    ...(position !== ALL && { position }),
  }).filter((champion) => matchesSearch(nameOf(champion), search));
  const games = champions.reduce(
    (total, champion) => total + champion.games,
    0,
  );

  return (
    <>
      <div className={styles.filters}>
        <select
          aria-label="Game mode"
          value={queue}
          onChange={(event) => {
            setQueue(event.target.value);
          }}
        >
          <option value={ALL}>All modes</option>
          {queues.map((option) => (
            <option key={option.name} value={option.name}>
              {option.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Position"
          value={position}
          onChange={(event) => {
            setPosition(event.target.value);
          }}
        >
          <option value={ALL}>All positions</option>
          {positions.map((option) => (
            <option key={option} value={option}>
              {positionName(option) ?? option}
            </option>
          ))}
        </select>
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
      <p className={styles.note} role="status">
        {String(games)} {games === 1 ? 'game' : 'games'} counted, among the ones
        stored on the site: not the whole history of the player. Arena has its
        own tab.
      </p>
      {champions.length === 0 ? (
        <p className={styles.empty}>No champion matches these filters.</p>
      ) : (
        <ChampionTable
          champions={champions}
          nameOf={nameOf}
          staticData={staticData}
        />
      )}
    </>
  );
}

function ChampionTable({
  champions,
  nameOf,
  staticData,
}: {
  readonly champions: readonly ChampionStats[];
  readonly nameOf: (champion: ChampionStats) => string;
  readonly staticData: StaticData | undefined;
}) {
  return (
    <div role="table" aria-label="Champions played" className={styles.table}>
      <div role="row" className={[styles.row, styles.head].join(' ')}>
        <span role="columnheader">Champion</span>
        <span role="columnheader">Win rate</span>
        <span role="columnheader">KDA</span>
        <span role="columnheader">CS</span>
      </div>
      {champions.map((champion) => (
        <div role="row" key={champion.championId} className={styles.row}>
          <span role="cell" className={styles.champion}>
            <ChampionIcon
              championId={champion.championId}
              championName={champion.championName}
              staticData={staticData}
              size={36}
            />
            <span className={styles.name}>{nameOf(champion)}</span>
          </span>
          <span role="cell">
            <span
              className={
                champion.winRate >= 50 ? styles.rateWon : styles.rateLost
              }
            >
              {champion.winRate}%
            </span>
            <span className={styles.small}>
              {champion.wins}W {champion.losses}L
            </span>
          </span>
          <span role="cell">
            <span className={styles.strong}>
              {formatKdaRatio(
                champion.kills,
                champion.deaths,
                champion.assists,
              )}{' '}
              KDA
            </span>
            <span className={styles.small}>
              {formatAverageScore(
                champion.averageKills,
                champion.averageDeaths,
                champion.averageAssists,
              )}
            </span>
          </span>
          <span role="cell">
            <span className={styles.strong}>
              {formatAverage(champion.averageCreepScore)}
            </span>
            <span className={styles.small}>
              {formatCsPerMinute(champion.creepScore, champion.durationSeconds)}
              /min
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
