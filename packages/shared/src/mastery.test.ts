import { describe, expect, it } from 'vitest';

import { championMasterySchema, playerMasterySchema } from './mastery.ts';

const SYLAS = {
  championId: 517,
  level: 32,
  points: 324_704,
  lastPlayedAt: '2026-10-01T10:11:11.000Z',
  pointsSinceLastLevel: 7104,
  pointsUntilNextLevel: 3896,
};

describe('championMasterySchema', () => {
  it('accepts a champion without a date of last game', () => {
    expect(
      championMasterySchema.safeParse({ ...SYLAS, lastPlayedAt: null }).success,
    ).toBe(true);
  });

  it.each([
    { level: -1 },
    { points: 1.5 },
    { lastPlayedAt: 'yesterday' },
    { pointsUntilNextLevel: -1 },
  ])('refuses %j', (change) => {
    expect(
      championMasterySchema.safeParse({ ...SYLAS, ...change }).success,
    ).toBe(false);
  });
});

describe('playerMasterySchema', () => {
  it('accepts a player without any mastery', () => {
    expect(
      playerMasterySchema.safeParse({ score: 0, totalPoints: 0, champions: [] })
        .success,
    ).toBe(true);
  });
});
