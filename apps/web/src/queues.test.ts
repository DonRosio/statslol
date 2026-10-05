import { describe, expect, it } from 'vitest';

import { isArenaGame, queueName } from './queues.ts';

describe('queueName', () => {
  it('names the game modes', () => {
    expect(queueName(420)).toBe('Solo/Duo');
    expect(queueName(440)).toBe('Flex');
    expect(queueName(400)).toBe('Normal');
    expect(queueName(430)).toBe('Normal');
    expect(queueName(1750)).toBe('Arena');
  });

  it('has a name for the modes it does not know', () => {
    expect(queueName(9999)).toBe('Other mode');
  });
});

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
