import type { PlayerParams, StaticData } from '@statslol/shared';
import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router';

import { masteryQuery } from '../api/players.ts';
import { useStaticData } from '../api/static-data.ts';
import { findChampion } from '../data-dragon.ts';
import { formatNumber } from '../format.ts';
import { PROFILE_TABS, profileTabPath } from '../profile-tabs.ts';
import { ChampionIcon } from './ChampionIcon.tsx';
import { MasteryEmblem } from './MasteryEmblem.tsx';
import styles from './TopMastery.module.css';

/** How many champions the box shows. */
const TOP = 3;

const MASTERY_TAB = PROFILE_TABS.find((tab) => tab.path === 'mastery');

/**
 * The champions the player has the most mastery points with, in a box of the overview, and a
 * link to the whole list. Nothing shows if the mastery cannot be had: it is a side box, the
 * rest of the page does not wait for it.
 */
export function TopMastery({ player }: { player: PlayerParams }) {
  const titleId = useId();
  const mastery = useQuery(masteryQuery(player));
  const staticData = useStaticData();

  if (mastery.data?.champions.length === 0 || mastery.error !== null) {
    return null;
  }
  return (
    <section className={styles.box} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        Top mastery
      </h2>
      {mastery.data === undefined ? (
        <div className={['skeleton', styles.placeholder].join(' ')} />
      ) : (
        <div className={styles.list}>
          {mastery.data.champions.slice(0, TOP).map((champion) => {
            const name = nameOf(staticData, champion.championId);
            return (
              <div
                key={champion.championId}
                role="group"
                className={styles.row}
              >
                <ChampionIcon
                  championId={champion.championId}
                  championName={name}
                  staticData={staticData}
                  size={36}
                  badge={champion.level}
                />
                <MasteryEmblem level={champion.level} />
                <div className={styles.text}>
                  <p className={styles.name}>{name}</p>
                  <p className={styles.points}>
                    {formatNumber(champion.points)} points
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {MASTERY_TAB !== undefined && (
        <Link to={profileTabPath(player, MASTERY_TAB)} className={styles.all}>
          All champions
        </Link>
      )}
    </section>
  );
}

function nameOf(
  staticData: StaticData | undefined,
  championId: number,
): string {
  return (
    (staticData === undefined
      ? undefined
      : findChampion(staticData, championId)?.name) ??
    `Champion ${String(championId)}`
  );
}
