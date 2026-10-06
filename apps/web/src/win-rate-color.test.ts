import { describe, expect, it } from 'vitest';

import { winRateColor } from './win-rate-color.ts';

describe('winRateColor', () => {
  it.each([
    [0, 'var(--color-rate-low)'],
    [20, 'var(--color-rate-low)'],
    [35, 'var(--color-rate-low)'],
    [50, 'var(--color-rate-mid)'],
    [65, 'var(--color-rate-high)'],
    [68, 'var(--color-rate-high)'],
    [70, 'var(--color-rate-top)'],
    [100, 'var(--color-rate-top)'],
  ])('is the color of the stop at %i', (rate, expected) => {
    expect(winRateColor(rate)).toBe(expected);
  });

  it('mixes red and grey between 35 and 50, more red the lower the rate', () => {
    expect(winRateColor(42.5)).toBe(
      'color-mix(in srgb, var(--color-rate-low) 50%, var(--color-rate-mid))',
    );
    expect(winRateColor(40)).toBe(
      'color-mix(in srgb, var(--color-rate-low) 67%, var(--color-rate-mid))',
    );
    expect(winRateColor(49)).toBe(
      'color-mix(in srgb, var(--color-rate-low) 7%, var(--color-rate-mid))',
    );
  });

  it('mixes blue and grey between 50 and 65, more blue the higher the rate', () => {
    expect(winRateColor(57.5)).toBe(
      'color-mix(in srgb, var(--color-rate-high) 50%, var(--color-rate-mid))',
    );
    expect(winRateColor(60)).toBe(
      'color-mix(in srgb, var(--color-rate-high) 67%, var(--color-rate-mid))',
    );
    expect(winRateColor(51)).toBe(
      'color-mix(in srgb, var(--color-rate-high) 7%, var(--color-rate-mid))',
    );
  });

  it('only uses the tokens of the stylesheet, no color of its own', () => {
    for (const rate of [0, 36, 47, 50, 53, 64, 66, 72]) {
      expect(winRateColor(rate)).not.toMatch(/#[0-9a-f]{3}|rgb\(|hsl\(/i);
    }
  });
});
