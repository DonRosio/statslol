import type { CSSProperties } from 'react';

import { winRateColor } from '../win-rate-color.ts';

/**
 * A win rate as a percentage, in its color of the scale. The color is given as a custom
 * property that the class `win-rate` (styles.css) paints with.
 */
export function WinRate({ rate }: { readonly rate: number }) {
  return (
    <span
      className="win-rate"
      style={{ '--win-rate-color': winRateColor(rate) } as CSSProperties}
    >
      {rate}%
    </span>
  );
}
