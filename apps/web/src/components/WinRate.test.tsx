import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WinRate } from './WinRate.tsx';

describe('WinRate', () => {
  it('writes the percentage, in the color the scale gives it', () => {
    render(<WinRate rate={57} />);

    const rate = screen.getByText('57%');
    expect(rate.className).toBe('win-rate');
    expect(rate.style.getPropertyValue('--win-rate-color')).toBe(
      'color-mix(in srgb, var(--color-rate-high) 47%, var(--color-rate-mid))',
    );
  });

  it.each([
    [10, 'var(--color-rate-low)'],
    [50, 'var(--color-rate-mid)'],
    [66, 'var(--color-rate-high)'],
    [80, 'var(--color-rate-top)'],
  ])('paints %i%% with %s', (rate, color) => {
    render(<WinRate rate={rate} />);

    expect(
      screen
        .getByText(`${String(rate)}%`)
        .style.getPropertyValue('--win-rate-color'),
    ).toBe(color);
  });
});
