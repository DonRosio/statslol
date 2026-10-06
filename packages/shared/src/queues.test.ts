import { describe, expect, it } from 'vitest';

import { isArenaGame } from './queues.ts';

describe('isArenaGame', () => {
  it.each([1700, 1710, 1750])('knows the Arena queue %i', (queueId) => {
    expect(isArenaGame({ queueId, placement: null })).toBe(true);
  });

  it('knows an Arena mode it has no name for yet, by the place it gives', () => {
    expect(isArenaGame({ queueId: 1800, placement: 3 })).toBe(true);
  });

  it.each([420, 440, 450, 400, 900])(
    'says queue %i is not Arena',
    (queueId) => {
      expect(isArenaGame({ queueId, placement: null })).toBe(false);
    },
  );
});
