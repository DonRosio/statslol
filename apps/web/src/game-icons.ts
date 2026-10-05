import baron from './assets/objectives/baron.png';
import dragon from './assets/objectives/dragon.png';
import gold from './assets/objectives/gold.png';
import grubs from './assets/objectives/grubs.png';
import herald from './assets/objectives/herald.png';
import tower from './assets/objectives/tower.png';
import bronze from './assets/ranks/bronze.png';
import challenger from './assets/ranks/challenger.png';
import diamond from './assets/ranks/diamond.png';
import emerald from './assets/ranks/emerald.png';
import gold_ from './assets/ranks/gold.png';
import grandmaster from './assets/ranks/grandmaster.png';
import master from './assets/ranks/master.png';
import platinum from './assets/ranks/platinum.png';
import silver from './assets/ranks/silver.png';

/** The icon of gold, next to an amount. */
export const GOLD_ICON = gold;

/**
 * What a team can take on the map, in the order they are shown: the icon, and the name of each
 * (for screen readers and the tooltip). The key is the field of the objectives of a match.
 */
export const OBJECTIVES = [
  { key: 'dragons', icon: dragon, name: 'Dragons' },
  { key: 'grubs', icon: grubs, name: 'Void grubs' },
  { key: 'heralds', icon: herald, name: 'Rift Heralds' },
  { key: 'barons', icon: baron, name: 'Barons' },
  { key: 'towers', icon: tower, name: 'Towers' },
] as const;

// The emblems of the ranks. There is none for Iron yet: its rank is only written.
const RANK_EMBLEMS: Readonly<Record<string, string>> = {
  BRONZE: bronze,
  SILVER: silver,
  GOLD: gold_,
  PLATINUM: platinum,
  EMERALD: emerald,
  DIAMOND: diamond,
  MASTER: master,
  GRANDMASTER: grandmaster,
  CHALLENGER: challenger,
};

/** The emblem of a tier ("DIAMOND"), or undefined if there is none. */
export function rankEmblem(tier: string): string | undefined {
  return RANK_EMBLEMS[tier];
}
