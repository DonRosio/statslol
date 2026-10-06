import { championStats, type ChampionStats } from '@statslol/core';
import {
  currentSeason,
  seasonById,
  seasonIdSchema,
  SEASONS,
  type ChampionRecord,
  type PlayerParams,
  type SeasonId,
  type SeasonSync,
  type StaticData,
} from '@statslol/shared';
import { useId, useState } from 'react';

import { useStaticData } from '../api/static-data.ts';
import {
  hasRoles,
  matchesSearch,
  queueIdsOf,
  QUEUE_FILTERS,
  ROLES,
  type QueueFilterId,
  type RoleId,
} from '../champion-filters.ts';
import { findChampion } from '../data-dragon.ts';
import {
  formatAverage,
  formatAverageScore,
  formatCsPerMinute,
  formatKdaRatio,
} from '../format.ts';
import { isLoading, useSeasonStats } from '../use-season-stats.ts';
import allRoles from '../assets/roles/all.png';
import bottom from '../assets/roles/bottom.png';
import fill from '../assets/roles/fill.png';
import jungle from '../assets/roles/jungle.png';
import middle from '../assets/roles/middle.png';
import top from '../assets/roles/top.png';
import utility from '../assets/roles/utility.png';
import { ChampionIcon } from './ChampionIcon.tsx';
import styles from './ChampionStatsBox.module.css';
import { ErrorMessage } from './ErrorMessage.tsx';
import { WinRate } from './WinRate.tsx';

const ROLE_ICONS: Readonly<Record<RoleId, string>> = {
  ALL: allRoles,
  TOP: top,
  JUNGLE: jungle,
  MIDDLE: middle,
  BOTTOM: bottom,
  UTILITY: utility,
};

/**
 * The "Champions" tab: what the player did with each champion in a season. Above the table,
 * the position (left), the season (middle) and the game mode (right); opening a season makes
 * the server load all its games, and the box says how far it is.
 */
export function ChampionStatsBox({ player }: { player: PlayerParams }) {
  const headingId = useId();
  const [season, setSeason] = useState<SeasonId>(
    () => currentSeason(new Date()).id,
  );
  const [role, setRole] = useState<RoleId>('ALL');
  const [queue, setQueue] = useState<QueueFilterId>('all');
  const [search, setSearch] = useState('');
  const { stats, sync } = useSeasonStats(player, season);
  const staticData = useStaticData();

  return (
    <section aria-labelledby={headingId} className={styles.box}>
      <h2 id={headingId} className="visually-hidden">
        Champions
      </h2>
      <div className={styles.header}>
        <RoleFilter queue={queue} role={role} onChange={setRole} />
        {/* Only the text and a small triangle: the triangle (drawn by the wrapper) says it opens. */}
        <span className={styles.seasonMenu}>
          <select
            aria-label="Season"
            className={styles.season}
            value={season}
            onChange={(event) => {
              setSeason(seasonIdSchema.parse(event.target.value));
            }}
          >
            {SEASONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
        <QueueFilter queue={queue} onChange={setQueue} />
      </div>
      <SyncProgress sync={sync} />
      {stats.data !== undefined ? (
        <Champions
          records={stats.data.records}
          role={role}
          queue={queue}
          search={search}
          onSearch={setSearch}
          sync={sync}
          season={season}
          staticData={staticData}
        />
      ) : stats.error !== null ? (
        <ErrorMessage
          title="The champions could not be loaded."
          error={stats.error}
          onRetry={() => {
            void stats.refetch();
          }}
          retrying={stats.isFetching}
        />
      ) : (
        <>
          <p role="status" className="visually-hidden">
            Loading the champions…
          </p>
          <div className={['skeleton', styles.placeholder].join(' ')} />
        </>
      )}
    </section>
  );
}

/**
 * The positions as a row of icons. Arena and ARAM have none: the row then shows only the
 * "fill" icon, lit, and the others are out of reach.
 */
function RoleFilter({
  queue,
  role,
  onChange,
}: {
  readonly queue: QueueFilterId;
  readonly role: RoleId;
  readonly onChange: (role: RoleId) => void;
}) {
  const withRoles = hasRoles(queue);
  return (
    <div role="group" aria-label="Position" className={styles.cells}>
      {ROLES.map(({ id, label }) => {
        const selected = withRoles ? role === id : id === 'ALL';
        // Without positions, the first cell becomes "fill" (any role, whatever you play).
        const name = !withRoles && id === 'ALL' ? 'Fill' : label;
        const src = !withRoles && id === 'ALL' ? fill : ROLE_ICONS[id];
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            aria-label={name}
            title={name}
            disabled={!withRoles}
            className={[
              styles.cell,
              styles.roleCell,
              selected ? styles.selected : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              onChange(id);
            }}
          >
            {/* The icon is a shape (the picture is its mask), painted in the color of the
                text: grey, and the color of the box when the box is pink. */}
            <span
              aria-hidden="true"
              className={styles.roleIcon}
              style={{
                maskImage: `url(${src})`,
                WebkitMaskImage: `url(${src})`,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

/** The game modes as a row of boxes: one is lit. */
function QueueFilter({
  queue,
  onChange,
}: {
  readonly queue: QueueFilterId;
  readonly onChange: (queue: QueueFilterId) => void;
}) {
  return (
    <div role="group" aria-label="Game mode" className={styles.cells}>
      {QUEUE_FILTERS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={queue === id}
          className={[
            styles.cell,
            styles.queueCell,
            queue === id ? styles.selected : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => {
            onChange(id);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** How far the server is in loading the season's games: nothing once it is done. */
function SyncProgress({ sync }: { readonly sync: SeasonSync | undefined }) {
  if (sync === undefined || sync.state === 'idle') return null;
  if (sync.state === 'queued') {
    return (
      <p className={styles.progress} role="status">
        Waiting for the games of another player to finish loading…
      </p>
    );
  }
  if (sync.state === 'running') {
    const seen = sync.done + sync.failed;
    return (
      <div className={styles.progress} role="status">
        <p>
          {sync.total === 0
            ? 'Looking for the games of the season…'
            : `Loading the games of the season: ${String(seen)} / ${String(sync.total)}`}
        </p>
        {sync.total > 0 && (
          <progress
            className={styles.bar}
            max={sync.total}
            value={seen}
            aria-label="Games of the season loaded"
          />
        )}
      </div>
    );
  }
  if (sync.state === 'failed') {
    return (
      <p className={styles.progress} role="alert">
        The loading of the season stopped: some games may be missing. Open the
        tab again later to continue.
      </p>
    );
  }
  return sync.failed > 0 ? (
    <p className={styles.progress} role="status">
      {sync.failed} {sync.failed === 1 ? 'game' : 'games'} of the season could
      not be loaded.
    </p>
  ) : null;
}

function Champions({
  records,
  role,
  queue,
  search,
  onSearch,
  sync,
  season,
  staticData,
}: {
  readonly records: readonly ChampionRecord[];
  readonly role: RoleId;
  readonly queue: QueueFilterId;
  readonly search: string;
  readonly onSearch: (search: string) => void;
  readonly sync: SeasonSync | undefined;
  readonly season: SeasonId;
  readonly staticData: StaticData | undefined;
}) {
  const nameOf = (champion: ChampionStats) =>
    (staticData === undefined
      ? undefined
      : findChampion(staticData, champion.championId)?.name) ??
    champion.championName;

  const position = hasRoles(queue) && role !== 'ALL' ? role : undefined;
  const champions = championStats(records, {
    queueIds: queueIdsOf(queue, records),
    ...(position !== undefined && { position }),
  }).filter((champion) => matchesSearch(nameOf(champion), search));
  const games = champions.reduce(
    (total, champion) => total + champion.games,
    0,
  );
  const seasonLabel = seasonById(season).label;

  let table;
  if (records.length === 0) {
    table = (
      <p className={styles.empty}>
        {isLoading(sync)
          ? 'The games arrive…'
          : `No game stored for ${seasonLabel}.`}
      </p>
    );
  } else if (champions.length === 0) {
    table = <p className={styles.empty}>No champion matches these filters.</p>;
  } else {
    table = (
      <ChampionTable
        champions={champions}
        arena={queue === 'arena'}
        nameOf={nameOf}
        staticData={staticData}
      />
    );
  }

  return (
    <>
      <div className={styles.tools}>
        <input
          type="search"
          aria-label="Search a champion"
          placeholder="Search a champion"
          value={search}
          onChange={(event) => {
            onSearch(event.target.value);
          }}
        />
        <p className={styles.note} role="status">
          {String(games)} {games === 1 ? 'game' : 'games'} · {seasonLabel}
        </p>
      </div>
      {table}
    </>
  );
}

function ChampionTable({
  champions,
  arena,
  nameOf,
  staticData,
}: {
  readonly champions: readonly ChampionStats[];
  /** Arena has no minions: the places say more than the CS. */
  readonly arena: boolean;
  readonly nameOf: (champion: ChampionStats) => string;
  readonly staticData: StaticData | undefined;
}) {
  return (
    <div role="table" aria-label="Champions played" className={styles.table}>
      <div role="row" className={[styles.row, styles.head].join(' ')}>
        <span role="columnheader">Champion</span>
        <span role="columnheader">Win rate</span>
        <span role="columnheader">KDA</span>
        <span role="columnheader">{arena ? 'Place' : 'CS'}</span>
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
            <WinRate rate={champion.winRate} />
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
            {arena ? (
              <>
                <span className={styles.strong}>
                  {champion.averagePlacement === null
                    ? '–'
                    : formatAverage(champion.averagePlacement)}
                </span>
                <span className={styles.small}>average</span>
              </>
            ) : (
              <>
                <span className={styles.strong}>
                  {formatAverage(champion.averageCreepScore)}
                </span>
                <span className={styles.small}>
                  {formatCsPerMinute(
                    champion.creepScore,
                    champion.durationSeconds,
                  )}
                  /min
                </span>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
