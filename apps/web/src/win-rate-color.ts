/** The part of the scale below which every win rate has the same color: red. */
const LOW = 35;
/** The middle of the scale: the soft grey of a win rate of half. */
const MID = 50;
/** From here the color stays the blue of the high end. */
const HIGH = 65;
/** From here the color is the accent's pink: the exceptional. */
const TOP = 70;

/** A mix of the end color and the middle one, `share` (0 to 1) of the end. */
function mix(end: string, share: number): string {
  return `color-mix(in srgb, var(--color-rate-${end}) ${String(Math.round(share * 100))}%, var(--color-rate-mid))`;
}

/**
 * The color of a win rate (a percentage, 0 to 100), as a CSS value built on the tokens of
 * styles.css (--color-rate-*): red up to 35, a gradient through a soft grey at 50 to blue at
 * 65, blue up to 70, then the pink of the accent. The gradient is where win rates are (35 to
 * 65): over the whole 0 to 100 they would all look alike.
 */
export function winRateColor(rate: number): string {
  if (rate >= TOP) return 'var(--color-rate-top)';
  if (rate >= HIGH) return 'var(--color-rate-high)';
  if (rate > MID) return mix('high', (rate - MID) / (HIGH - MID));
  if (rate === MID) return 'var(--color-rate-mid)';
  if (rate > LOW) return mix('low', (MID - rate) / (MID - LOW));
  return 'var(--color-rate-low)';
}
