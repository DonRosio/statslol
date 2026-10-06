import level1 from '../assets/mastery/mastery-1.png';
import level2 from '../assets/mastery/mastery-2.png';
import level3 from '../assets/mastery/mastery-3.png';
import level4 from '../assets/mastery/mastery-4.png';
import level5 from '../assets/mastery/mastery-5.png';
import level6 from '../assets/mastery/mastery-6.png';
import level7 from '../assets/mastery/mastery-7.png';
import level8 from '../assets/mastery/mastery-8.png';
import level9 from '../assets/mastery/mastery-9.png';
import level10 from '../assets/mastery/mastery-10.png';
import styles from './MasteryEmblem.module.css';

// The emblems of the levels 1 to 10, as in the game (wings that grow, then a gem: green,
// blue, pink, orange, and the prismatic one). They are cut out of a picture of the set.
const EMBLEMS = [
  level1,
  level2,
  level3,
  level4,
  level5,
  level6,
  level7,
  level8,
  level9,
  level10,
];

// The pictures are 140 × 100: shown 30 px high (42 wide) unless a height is asked.
const DEFAULT_HEIGHT = 30;
const ASPECT_RATIO = 140 / 100;

/**
 * The emblem of a mastery level. Past level 10 the game has no new emblem (the level goes on
 * counting), so level 10's stays. Nothing for level 0: a champion that has not been played.
 */
export function MasteryEmblem({
  level,
  height = DEFAULT_HEIGHT,
}: {
  readonly level: number;
  /** Height in pixels; the width follows the picture's proportions. */
  readonly height?: number;
}) {
  const src = EMBLEMS[Math.min(level, EMBLEMS.length) - 1];
  if (src === undefined) return null;
  const name = `Mastery level ${String(level)}`;
  return (
    <img
      src={src}
      alt={name}
      title={name}
      width={Math.round(height * ASPECT_RATIO)}
      height={height}
      className={styles.emblem}
    />
  );
}
