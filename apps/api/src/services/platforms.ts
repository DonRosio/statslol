import type { Platform } from '@statslol/riot-client';
import type { Region } from '@statslol/shared';

// Our regions are the names players know; Riot names its servers "platforms".
// `Record<Region, Platform>`: TypeScript reports a region added without its platform.
export const PLATFORM_BY_REGION: Record<Region, Platform> = {
  br: 'br1',
  eune: 'eun1',
  euw: 'euw1',
  jp: 'jp1',
  kr: 'kr',
  lan: 'la1',
  las: 'la2',
  me: 'me1',
  na: 'na1',
  oce: 'oc1',
  ru: 'ru',
  sea: 'sg2',
  tr: 'tr1',
  tw: 'tw2',
  vn: 'vn2',
};
