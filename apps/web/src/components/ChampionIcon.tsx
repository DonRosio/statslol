import type { StaticData } from '@statslol/shared';

import { championImageUrl, findChampion } from '../data-dragon.ts';
import { GameImage } from './GameImage.tsx';
import styles from './ChampionIcon.module.css';

interface ChampionIconProps {
  /** The `championId` of a game. */
  readonly championId: number;
  /** Riot's internal name: the name to show when Data Dragon does not know the champion. */
  readonly championName: string;
  readonly staticData: StaticData | undefined;
  /** Width and height in pixels. */
  readonly size: number;
  /** A small number in the bottom right corner (the level at the end of the game). */
  readonly badge?: number | undefined;
}

/**
 * The square image of a champion, from Data Dragon. Its files have a thin black edge: the
 * image is enlarged a little inside a frame that cuts it off. The name is not written next to
 * it, so the image carries it (for screen readers and as a tooltip), and so does the empty
 * square shown when the image is missing.
 */
export function ChampionIcon({
  championId,
  championName,
  staticData,
  size,
  badge,
}: ChampionIconProps) {
  const champion =
    staticData === undefined ? undefined : findChampion(staticData, championId);
  const name = champion?.name ?? championName;
  const dimensions = { width: size, height: size };
  return (
    <span className={styles.icon} style={dimensions}>
      <span className={styles.frame} style={dimensions}>
        <GameImage
          src={
            staticData === undefined || champion === undefined
              ? null
              : championImageUrl(staticData.version, champion)
          }
          size={size}
          className={styles.image}
          alt={name}
          fallback={
            <span
              className={styles.empty}
              style={dimensions}
              role="img"
              aria-label={name}
            />
          }
        />
      </span>
      {badge !== undefined && <span className={styles.badge}>{badge}</span>}
    </span>
  );
}
