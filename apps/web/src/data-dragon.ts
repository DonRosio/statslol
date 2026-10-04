import type { Champion, StaticData } from '@statslol/shared';

// Data Dragon: Riot's CDN for the files of the game (images, names...), free to use.
const CDN_URL = 'https://ddragon.leagueoflegends.com/cdn';

// The version and the champion IDs come from the API, which checks their format (digits and
// dots, letters and digits): they cannot change where these URLs point.

/** Image of a profile icon, e.g. .../cdn/16.19.1/img/profileicon/4568.png. */
export function profileIconUrl(version: string, iconId: number): string {
  return `${CDN_URL}/${version}/img/profileicon/${String(iconId)}.png`;
}

/** Square image of a champion, e.g. .../cdn/16.19.1/img/champion/MonkeyKing.png. */
export function championImageUrl(version: string, champion: Champion): string {
  return `${CDN_URL}/${version}/img/champion/${champion.id}.png`;
}

/** The champion with this ID (the `championId` of a match), if Data Dragon knows it. */
export function findChampion(
  staticData: StaticData,
  championId: number,
): Champion | undefined {
  return staticData.champions[String(championId)];
}
