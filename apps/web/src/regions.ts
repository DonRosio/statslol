import type { Region } from '@statslol/shared';

/** Full name of each server, shown next to its code (e.g. "EUW – Europe West"). */
export const REGION_NAMES: Record<Region, string> = {
  br: 'Brazil',
  eune: 'Europe Nordic & East',
  euw: 'Europe West',
  jp: 'Japan',
  kr: 'Korea',
  lan: 'Latin America North',
  las: 'Latin America South',
  me: 'Middle East',
  na: 'North America',
  oce: 'Oceania',
  ru: 'Russia',
  sea: 'Southeast Asia',
  tr: 'Türkiye',
  tw: 'Taiwan',
  vn: 'Vietnam',
};
