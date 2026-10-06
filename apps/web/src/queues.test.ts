import { describe, expect, it } from 'vitest';

import { queueName } from './queues.ts';

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
