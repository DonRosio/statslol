import { describe, expect, it } from 'vitest';

import {
  currentSeason,
  seasonById,
  seasonIdSchema,
  seasonWindow,
  SEASONS,
} from './seasons.ts';

describe('SEASONS', () => {
  it('goes from the latest to the oldest, each one starting where the next one ends, the latest having no end', () => {
    SEASONS.forEach((season, index) => {
      const older = SEASONS[index + 1];
      if (older !== undefined) {
        expect(older.endsAt).toBe(season.startsAt);
      }
    });
    expect(SEASONS[0].endsAt).toBeNull();
  });

  it('has the seasons the schema knows, no more and no fewer', () => {
    expect(SEASONS.map((season) => season.id).sort()).toEqual(
      [...seasonIdSchema.options].sort(),
    );
    expect(seasonIdSchema.safeParse('2026-3').success).toBe(false);
  });
});

describe('currentSeason', () => {
  it.each(['2026-10-06T12:00:00Z', '2026-01-08T00:00:00Z'])(
    'is Season 16 on %s',
    (date) => {
      expect(currentSeason(new Date(date)).id).toBe('2026');
    },
  );

  it('is the latest one for a date before them all (nothing else to show)', () => {
    expect(currentSeason(new Date('2020-01-01T00:00:00Z')).id).toBe('2026');
  });
});

describe('seasonWindow', () => {
  const now = new Date('2026-10-06T12:00:00Z');

  it('goes from the start of the season up to now while it is in progress', () => {
    expect(seasonWindow(seasonById('2026'), now)).toEqual({
      fromMs: Date.parse('2026-01-08T00:00:00Z'),
      toMs: now.getTime(),
    });
  });

  it('ends at the start of the season for a date before it', () => {
    expect(
      seasonWindow(seasonById('2026'), new Date('2025-01-01T00:00:00Z')),
    ).toEqual({
      fromMs: Date.parse('2026-01-08T00:00:00Z'),
      toMs: Date.parse('2026-01-08T00:00:00Z'),
    });
  });
});
