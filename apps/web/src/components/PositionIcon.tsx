import { positionName } from '../format.ts';
import styles from './PositionIcon.module.css';

type Lane = 'top' | 'middle' | 'bottom';

// Each lane of the map as a line on a 16 × 16 square: the top and the bottom lanes along
// the edges, the middle one across.
const LANES: Record<Lane, string> = {
  top: 'M3 13V3h10',
  middle: 'M3 13 13 3',
  bottom: 'M3 13h10V3',
};

/** What is drawn in the position's colors, over the lines of the map. */
function Marker({ position }: { readonly position: string }) {
  switch (position) {
    case 'TOP':
      return <path className={styles.active} d={LANES.top} />;
    case 'MIDDLE':
      return <path className={styles.active} d={LANES.middle} />;
    case 'BOTTOM':
      return <path className={styles.active} d={LANES.bottom} />;
    case 'JUNGLE':
      // The jungle is the space between the lanes: a diamond in the middle.
      return <path className={styles.filled} d="M8 4.5 11.5 8 8 11.5 4.5 8Z" />;
    case 'UTILITY':
      // A support helps the others: a cross, as for healing.
      return <path className={styles.active} d="M8 5v6M5 8h6" />;
    default:
      return null;
  }
}

/**
 * The position of the player in a game, on a small map: Top, Jungle, Mid, Bottom or Support.
 * Nothing in the modes without positions.
 */
export function PositionIcon({
  position,
}: {
  readonly position: string | null;
}) {
  const name = positionName(position);
  if (position === null || name === null) return null;
  return (
    <svg
      viewBox="0 0 16 16"
      width="20"
      height="20"
      className={styles.icon}
      role="img"
      aria-label={name}
    >
      <title>{name}</title>
      {/* The map, faint; the position is drawn over it. */}
      {Object.values(LANES).map((path) => (
        <path key={path} className={styles.lane} d={path} />
      ))}
      <Marker position={position} />
    </svg>
  );
}
