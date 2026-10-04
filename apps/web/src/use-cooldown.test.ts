import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCooldown } from './use-cooldown.ts';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useCooldown', () => {
  it('is 0 until started', () => {
    const { result } = renderHook(() => useCooldown());

    expect(result.current.secondsLeft).toBe(0);
  });

  it('counts down the seconds, down to 0', () => {
    const { result } = renderHook(() => useCooldown());

    act(() => {
      result.current.start(3);
    });
    const seen = [result.current.secondsLeft];
    for (let tick = 0; tick < 4; tick += 1) {
      // One second at a time: each tick plans the next one once the page is rendered.
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      seen.push(result.current.secondsLeft);
    }

    expect(seen).toEqual([3, 2, 1, 0, 0]);
  });

  it('follows the clock when the timers of a background tab are slowed down', () => {
    const { result } = renderHook(() => useCooldown());
    act(() => {
      result.current.start(120);
    });

    // The browser ran no timer for a minute, then fires the late one.
    act(() => {
      vi.setSystemTime(Date.now() + 60_000);
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.secondsLeft).toBe(59);
  });
});
