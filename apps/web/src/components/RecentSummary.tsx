import type { StaticData } from '@statslol/shared';

import { championImageUrl, findChampion } from '../data-dragon.ts';
import { formatAverageScore, formatKdaRatio } from '../format.ts';
import type { ChampionStats, GroupStats } from '../recent-stats.ts';
import { GameImage } from './GameImage.tsx';
import styles from './RecentSummary.module.css';

const CHAMPION_IMAGE_SIZE = 32;

// The ring is drawn in a 100 × 100 square: a circle of radius 42 and a line of 10.
const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface RecentSummaryProps {
  /** The numbers of the last games, with the most played champions. */
  readonly stats: GroupStats & { readonly champions: readonly ChampionStats[] };
  readonly staticData: StaticData | undefined;
}

/**
 * What the last games come to: the most played champions, the win rate as a ring, and the
 * average score. Nothing for no game.
 */
export function RecentSummary({ stats, staticData }: RecentSummaryProps) {
  if (stats.games === 0) return null;
  return (
    <div className={styles.summary}>
      <p className={styles.caption}>Last {stats.games} games</p>
      <div className={styles.blocks}>
        <TopChampions champions={stats.champions} staticData={staticData} />
        <WinRateRing stats={stats} />
        <AverageScore stats={stats} />
      </div>
    </div>
  );
}

/** The share of wins as a ring: the arc of the wins in blue, the rest in orange. */
function WinRateRing({ stats }: { readonly stats: GroupStats }) {
  const { wins, losses, games, winRate } = stats;
  return (
    <div
      className={styles.ring}
      // The numbers inside say the same thing in words, for screen readers.
      role="img"
      aria-label={`Win rate: ${String(winRate)}%, ${String(wins)} ${wins === 1 ? 'win' : 'wins'} and ${String(losses)} ${losses === 1 ? 'loss' : 'losses'}`}
    >
      <svg
        viewBox="0 0 100 100"
        className={styles.ringDrawing}
        aria-hidden="true"
      >
        <circle className={styles.ringLosses} cx="50" cy="50" r={RING_RADIUS} />
        {wins > 0 && (
          <circle
            className={styles.ringWins}
            cx="50"
            cy="50"
            r={RING_RADIUS}
            // Starts at the top, and goes clockwise.
            transform="rotate(-90 50 50)"
            strokeDasharray={`${String((RING_CIRCUMFERENCE * wins) / games)} ${String(RING_CIRCUMFERENCE)}`}
          />
        )}
      </svg>
      <div className={styles.ringText} aria-hidden="true">
        <strong className={styles.ringRate}>{winRate}%</strong>
        <span className={styles.small}>
          {wins}W - {losses}L
        </span>
      </div>
    </div>
  );
}

/** The ratio (kills + assists) / deaths, and under it the average kills, deaths and assists. */
function AverageScore({ stats }: { readonly stats: GroupStats }) {
  return (
    <div className={styles.score}>
      <p className={styles.scoreRatio}>
        {formatKdaRatio(stats.kills, stats.deaths, stats.assists)}{' '}
        <span className={styles.small}>KDA</span>
      </p>
      <p className={styles.small}>
        <span className="visually-hidden">
          Average kills, deaths, assists:{' '}
        </span>
        {formatAverageScore(
          stats.averageKills,
          stats.averageDeaths,
          stats.averageAssists,
        )}
      </p>
    </div>
  );
}

/** The most played champions: record, win rate and average score of each. */
function TopChampions({
  champions,
  staticData,
}: {
  readonly champions: readonly ChampionStats[];
  readonly staticData: StaticData | undefined;
}) {
  return (
    <div
      role="group"
      aria-label="Most played champions"
      className={styles.champions}
    >
      {champions.map((stats) => (
        <ChampionRow
          key={stats.championId}
          stats={stats}
          staticData={staticData}
        />
      ))}
    </div>
  );
}

function ChampionRow({
  stats,
  staticData,
}: {
  readonly stats: ChampionStats;
  readonly staticData: StaticData | undefined;
}) {
  const champion =
    staticData === undefined
      ? undefined
      : findChampion(staticData, stats.championId);
  return (
    <div className={styles.champion}>
      <GameImage
        src={
          staticData === undefined || champion === undefined
            ? null
            : championImageUrl(staticData.version, champion)
        }
        size={CHAMPION_IMAGE_SIZE}
        className={styles.championImage}
        fallback={<span className={styles.championImage} />}
      />
      <div className={styles.championName}>
        {/* Data Dragon's name ("Wukong"), or else Riot's internal one ("MonkeyKing"). */}
        <p className={styles.strong}>{champion?.name ?? stats.championName}</p>
        <p className={styles.small}>
          {stats.wins}W - {stats.losses}L
        </p>
      </div>
      <p
        className={
          (stats.winRate ?? 0) >= 50 ? styles.rateWon : styles.rateLost
        }
      >
        {stats.winRate}%<span className="visually-hidden"> win rate</span>
      </p>
      <div className={styles.championScore}>
        <p className={styles.strong}>
          {formatKdaRatio(stats.kills, stats.deaths, stats.assists)}{' '}
          <span className={styles.small}>KDA</span>
        </p>
        <p className={styles.small}>
          <span className="visually-hidden">
            Average kills, deaths, assists:{' '}
          </span>
          {formatAverageScore(
            stats.averageKills,
            stats.averageDeaths,
            stats.averageAssists,
          )}
        </p>
      </div>
    </div>
  );
}
