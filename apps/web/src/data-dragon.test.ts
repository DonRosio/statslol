import { describe, expect, it } from 'vitest';

import {
  championImageUrl,
  findChampion,
  profileIconUrl,
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
