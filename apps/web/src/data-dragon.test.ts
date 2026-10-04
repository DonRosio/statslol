import { describe, expect, it } from 'vitest';

import {
  championImageUrl,
  findChampion,
  findItemName,
  findRune,
  findSpell,
  itemImageUrl,
  profileIconUrl,
  runeImageUrl,
  spellImageUrl,
} from './data-dragon.ts';
import { STATIC_DATA } from './test-data.ts';

describe('Data Dragon URLs', () => {
  it('points to the image of a profile icon', () => {
    expect(profileIconUrl('16.19.1', 4568)).toBe(
      'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/profileicon/4568.png',
    );
  });

  it("points to the image of a champion, named by Data Dragon's ID", () => {
    expect(
      championImageUrl('16.19.1', { id: 'MonkeyKing', name: 'Wukong' }),
    ).toBe(
      'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/champion/MonkeyKing.png',
    );
  });
});

describe('Data Dragon URLs of the loadout', () => {
  it('points to the image of an item, named by its ID', () => {
    expect(itemImageUrl('16.19.1', 3078)).toBe(
      'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/item/3078.png',
    );
  });

  it("points to the image of a spell, named by Data Dragon's ID", () => {
    expect(
      spellImageUrl('16.19.1', { id: 'SummonerFlash', name: 'Flash' }),
    ).toBe(
      'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/spell/SummonerFlash.png',
    );
  });

  it('points to the image of a rune, which is not versioned', () => {
    expect(
      runeImageUrl({
        name: 'Resolve',
        icon: 'perk-images/Styles/7204_Resolve.png',
      }),
    ).toBe(
      'https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7204_Resolve.png',
    );
  });
});

describe('finding the loadout', () => {
  it('finds the name of an item, and nothing for an unknown or unnamed one', () => {
    expect(findItemName(STATIC_DATA, 3078)).toBe('Trinity Force');
    expect(findItemName(STATIC_DATA, 999999)).toBeUndefined();
    expect(
      findItemName({ ...STATIC_DATA, items: { '2008': { name: '' } } }, 2008),
    ).toBeUndefined();
  });

  it('finds a spell and a rune by the ID of a match', () => {
    expect(findSpell(STATIC_DATA, 4)).toEqual({
      id: 'SummonerFlash',
      name: 'Flash',
    });
    expect(findRune(STATIC_DATA, 8008)?.name).toBe('Lethal Tempo');
    expect(findSpell(STATIC_DATA, 1)).toBeUndefined();
    expect(findRune(STATIC_DATA, 1)).toBeUndefined();
  });
});

describe('findChampion', () => {
  it('finds a champion by the championId of a match', () => {
    expect(findChampion(STATIC_DATA, 62)).toEqual({
      id: 'MonkeyKing',
      name: 'Wukong',
    });
  });

  it('finds nothing for a champion Data Dragon does not know', () => {
    expect(findChampion(STATIC_DATA, 999)).toBeUndefined();
  });
});
