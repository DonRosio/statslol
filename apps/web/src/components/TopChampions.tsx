import { championStats } from '@statslol/core';
import { currentSeason, type PlayerParams } from '@statslol/shared';
import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router';

import { championStatsQuery } from '../api/players.ts';
import { useStaticData } from '../api/static-data.ts';
import { queueIdsOf } from '../champion-filters.ts';
import { formatAverageScore, formatKdaRatio } from '../format.ts';
import { PROFILE_TABS, profileTabPath } from '../profile-tabs.ts';
import { ChampionIcon } from './ChampionIcon.tsx';
import { WinRate } from './WinRate.tsx';
import styles from './TopChampions.module.css';

/** How many champions the box shows. */
const TOP = 5;

const CHAMPIONS_TAB = PROFILE_TABS.find((tab) => tab.path === 'champions');

/**
 * The champions the player has played the most in the season, in a box of the overview. For
 * each: its icon (the name is its text for screen readers and its tooltip, not written), the
 * average KDA with the average kills, deaths and assists under it, and the win rate with the
 * wins and losses, and the number of games under it. A link leads to the Champions tab. Made
 * from the games the site has stored (all the modes but Arena, as the "All" of that tab); it
 * only reads them, the Champions tab is what loads the whole season. Nothing shows when there
 * is none, or when the statistics cannot be had: it is a side box, the page does not wait for
 * it.
 */
export function TopChampions({ player }: { player: PlayerParams }) {
  const titleId = useId();
  const season = currentSeason(new Date());
  const stats = useQuery(championStatsQuery(player, season.id));
  const staticData = useStaticData();

  const records = stats.data?.records;
  const top =
    records === undefined
      ? undefined
      : championStats(records, {
          queueIds: queueIdsOf('all', records),
        }).slice(0, TOP);

  if (stats.error !== null || top?.length === 0) return null;
  return (
    <section className={styles.box} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        Top played champions{' '}
        <span className={styles.season}>{season.label}</span>
      </h2>
      {top === undefined ? (
        <div className={['skeleton', styles.placeholder].join(' ')} />
      ) : (
        <div className={styles.list}>
          {top.map((champion) => (
            <div key={champion.championId} role="group" className={styles.row}>
              <ChampionIcon
                championId={champion.championId}
                championName={champion.championName}
                staticData={staticData}
                size={36}
              />
              <div className={styles.cell}>
                <p className={styles.main}>
                  {formatKdaRatio(
                    champion.kills,
                    champion.deaths,
                    champion.assists,
                  )}{' '}
                  KDA
                </p>
                <p className={styles.detail}>
                  {formatAverageScore(
                    champion.averageKills,
                    champion.averageDeaths,
                    champion.averageAssists,
                  )}
                </p>
              </div>
              <div className={styles.cell}>
                <p className={styles.main}>
                  <WinRate rate={champion.winRate} /> - {champion.wins}W/
                  {champion.losses}L
                </p>
                <p className={styles.detail}>
                  {champion.games} {champion.games === 1 ? 'game' : 'games'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {CHAMPIONS_TAB !== undefined && (
        <Link to={profileTabPath(player, CHAMPIONS_TAB)} className={styles.all}>
          All champions
        </Link>
      )}
    </section>
  );
}
