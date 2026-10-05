import { describe, expect, it } from 'vitest';

import {
  formatCsPerMinute,
  formatDuration,
  formatKdaRatio,
  formatKillParticipation,
  formatPlacement,
  formatResult,
  formatTier,
  formatTimeAgo,
  positionName,
  winRate,
} from './format.ts';

describe('formatTier', () => {
  it.each([
    ['GOLD', 'II', 'Gold II'],
    ['IRON', 'IV', 'Iron IV'],
    ['GRANDMASTER', null, 'Grandmaster'],
  ] as const)('writes %s %s as "%s"', (tier, division, expected) => {
    expect(formatTier({ tier, division })).toBe(expected);
  });
});

describe('winRate', () => {
  it('rounds the percentage of games won', () => {
    expect(winRate(2, 1)).toBe(67);
    expect(winRate(0, 5)).toBe(0);
  });

  it('is null before the first game', () => {
    expect(winRate(0, 0)).toBeNull();
  });
});

describe('formatKdaRatio', () => {
  it.each([
    [7, 2, 9, '8.00'],
    [1, 3, 0, '0.33'],
    [3, 0, 5, 'Perfect'],
    [0, 0, 0, '0.00'],
  ])('%i/%i/%i → %s', (kills, deaths, assists, expected) => {
    expect(formatKdaRatio(kills, deaths, assists)).toBe(expected);
  });
});

describe('formatCsPerMinute', () => {
  it('divides by the duration in minutes, with 1 decimal', () => {
    expect(formatCsPerMinute(192, 1834)).toBe('6.3');
  });

  it('is 0 for a game of no duration', () => {
    expect(formatCsPerMinute(0, 0)).toBe('0.0');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [65, '1:05'],
    [1834, '30:34'],
    [3729, '1:02:09'],
  ])('%i seconds → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('formatPlacement', () => {
  it.each([
    [1, '1st place'],
    [2, '2nd place'],
    [3, '3rd place'],
    [4, '4th place'],
    [6, '6th place'],
  ])('%i → %s', (placement, expected) => {
    expect(formatPlacement(placement)).toBe(expected);
  });
});

describe('formatResult', () => {
  it('names wins, losses and remakes', () => {
    expect(formatResult({ result: 'win', placement: null })).toBe('Victory');
    expect(formatResult({ result: 'loss', placement: null })).toBe('Defeat');
    expect(formatResult({ result: 'remake', placement: null })).toBe('Remake');
  });

  it('gives the place in modes ranked by place', () => {
    expect(formatResult({ result: 'win', placement: 3 })).toBe('3rd place');
    expect(formatResult({ result: 'loss', placement: 5 })).toBe('5th place');
  });
});

describe('positionName', () => {
  it('names the positions', () => {
    expect(positionName('MIDDLE')).toBe('Mid');
    expect(positionName('UTILITY')).toBe('Support');
  });

  it('gives no name without a position, or for one not known yet', () => {
    expect(positionName(null)).toBeNull();
    expect(positionName('NEW_LANE')).toBeNull();
  });
});

describe('formatTimeAgo', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');

  it.each([
    ['2026-10-04T11:59:30Z', 'just now'],
    ['2026-10-04T11:59:00Z', '1 min ago'],
    ['2026-10-04T11:26:00Z', '34 min ago'],
    ['2026-10-04T11:00:00Z', '1h ago'],
    ['2026-10-04T07:00:30Z', '4h ago'],
    ['2026-10-03T12:00:00Z', '1d ago'],
    ['2026-10-03T11:00:00Z', '1d ago'],
    ['2026-09-29T12:00:00Z', '5d ago'],
    ['2026-09-20T12:00:00Z', '14d ago'],
    ['2025-12-20T12:00:00Z', '288d ago'],
    ['2024-10-01T12:00:00Z', '733d ago'],
  ])('%s → %s', (date, expected) => {
    expect(formatTimeAgo(date, now)).toBe(expected);
  });
});

describe('formatKillParticipation', () => {
  it.each([
    [7, 9, 36, '44%'],
    [0, 0, 20, '0%'],
    [10, 5, 15, '100%'],
    // Rounded to the nearest percent.
    [1, 1, 3, '67%'],
  ])(
    '%i kills and %i assists in %i team kills: %s',
    (kills, assists, team, expected) => {
      expect(formatKillParticipation(kills, assists, team)).toBe(expected);
    },
  );

  it('is 0% when the team has no kill, rather than a division by zero', () => {
    expect(formatKillParticipation(0, 0, 0)).toBe('0%');
  });
});
