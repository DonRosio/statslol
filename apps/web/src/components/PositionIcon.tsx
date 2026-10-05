import bottom from '../assets/positions/bottom.png';
import jungle from '../assets/positions/jungle.png';
import middle from '../assets/positions/middle.png';
import top from '../assets/positions/top.png';
import utility from '../assets/positions/utility.png';
import { positionName } from '../format.ts';
import styles from './PositionIcon.module.css';

const ICON_SIZE = 24;

// The icons of the positions (grey tones on a dark chip, made from the game's own icons).
const ICONS: Readonly<Record<string, string>> = {
  TOP: top,
  JUNGLE: jungle,
  MIDDLE: middle,
  BOTTOM: bottom,
  UTILITY: utility,
};

/**
 * The position of the player in a game: Top, Jungle, Mid, Bot or Support. Nothing in the
 * modes without positions.
 */
export function PositionIcon({
  position,
}: {
  readonly position: string | null;
}) {
  const name = positionName(position);
  const src = position === null ? undefined : ICONS[position];
  if (name === null || src === undefined) return null;
  return (
    <img
      src={src}
      alt={name}
      title={name}
      width={ICON_SIZE}
      height={ICON_SIZE}
      className={styles.icon}
    />
  );
}
