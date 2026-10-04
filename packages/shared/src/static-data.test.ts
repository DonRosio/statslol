import { describe, expect, it } from 'vitest';

import { staticDataSchema } from './static-data.ts';

const VALID = {
  version: '16.19.1',
  champions: { '62': { id: 'MonkeyKing', name: 'Wukong' } },
  items: { '3078': { name: 'Trinity Force' } },
  summonerSpells: { '74': { id: 'SummonerFlash_Jade', name: 'Flash' } },
  runes: {
    '8008': {
      name: 'Lethal Tempo',
      icon: 'perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png',
    },
  },
};

describe('staticDataSchema', () => {
  it('accepts a version, champions, items, spells and runes by ID', () => {
    expect(staticDataSchema.parse(VALID)).toEqual(VALID);
  });

  it.each([
    ['a version that is a path', { ...VALID, version: '../16.19.1' }],
    [
      'a champion ID that is a path',
      {
        ...VALID,
        champions: { '62': { id: '../MonkeyKing', name: 'Wukong' } },
      },
    ],
    [
      'an item keyed by name',
      { ...VALID, items: { Sword: { name: 'Sword' } } },
    ],
    [
      'a spell ID that is a path',
      {
        ...VALID,
        summonerSpells: { '4': { id: '../Flash', name: 'Flash' } },
      },
    ],
    [
      'a rune icon outside the images',
      { ...VALID, runes: { '8008': { name: 'x', icon: '../8008.png' } } },
    ],
    [
      'a champion keyed by name',
      {
        ...VALID,
        champions: { MonkeyKing: { id: 'MonkeyKing', name: 'Wukong' } },
      },
    ],
  ])('rejects %s', (_case, data) => {
    expect(staticDataSchema.safeParse(data).success).toBe(false);
  });
});
