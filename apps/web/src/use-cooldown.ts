import { useEffect, useState } from 'react';

interface Cooldown {
  /** When the cooldown ends, in milliseconds since 1970. */
  readonly endsAt: number;
  /** Time of the last tick: the page shows the seconds left at that time. */
  readonly now: number;
}

/**
 * A countdown in seconds, e.g. before the "Update" button can be used again. Computed from
 * the clock at each tick, so it stays right even when the browser slows down the timers of
 * a background tab.
 */
export function useCooldown(): {
  readonly secondsLeft: number;
  readonly start: (seconds: number) => void;
} {
  const [cooldown, setCooldown] = useState<Cooldown | null>(null);

  useEffect(() => {
    if (cooldown === null) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setCooldown(now >= cooldown.endsAt ? null : { ...cooldown, now });
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [cooldown]);

  return {
    secondsLeft:
      cooldown === null
        ? 0
        : Math.ceil((cooldown.endsAt - cooldown.now) / 1000),
    start: (seconds) => {
      const now = Date.now();
      setCooldown({ endsAt: now + seconds * 1000, now });
    },
  };
}
