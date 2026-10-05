import type {
  Champion,
  Rune,
  StaticData,
  SummonerSpell,
} from '@statslol/shared';

// Data Dragon: Riot's CDN for the files of the game (images, names...), free to use.
const CDN_URL = 'https://ddragon.leagueoflegends.com/cdn';

// The version, the IDs and the paths come from the API, which checks their format (digits and
// dots, letters and digits, a path of images): they cannot change where these URLs point.

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

/** Image of an item, e.g. .../cdn/16.19.1/img/item/3078.png. Its file is named by its ID. */
export function itemImageUrl(version: string, itemId: number): string {
  return `${CDN_URL}/${version}/img/item/${String(itemId)}.png`;
}

/** Image of a summoner spell, e.g. .../cdn/16.19.1/img/spell/SummonerFlash.png. */
export function spellImageUrl(version: string, spell: SummonerSpell): string {
  return `${CDN_URL}/${version}/img/spell/${spell.id}.png`;
}

/** Image of a rune or of a tree of runes. Not versioned: .../cdn/img/perk-images/... */
export function runeImageUrl(rune: Rune): string {
  return `${CDN_URL}/img/${rune.icon}`;
}

/** The name of the item, if Data Dragon knows it (a few have none, or are too recent). */
export function findItemName(
  staticData: StaticData,
  itemId: number,
): string | undefined {
  const name = staticData.items[String(itemId)]?.name;
  return name === '' ? undefined : name;
}

/** The summoner spell with this key (a `spellIds` of a match), if Data Dragon knows it. */
export function findSpell(
  staticData: StaticData,
  spellId: number,
): SummonerSpell | undefined {
  return staticData.summonerSpells[String(spellId)];
}

/** The rune or tree of runes with this ID (a `runes` of a match), if Data Dragon knows it. */
export function findRune(
  staticData: StaticData,
  runeId: number,
): Rune | undefined {
  return staticData.runes[String(runeId)];
}

/** What is needed to show a spell, a rune or an item: its image, and its name if it is known. */
export interface GameThing {
  /** URL of the image; null when it cannot be known (no static data, or an unknown ID). */
  readonly src: string | null;
  readonly name: string | undefined;
}

/** A summoner spell (a `spellIds` of a match). */
export function spellThing(
  staticData: StaticData | undefined,
  spellId: number,
): GameThing {
  const spell =
    staticData === undefined ? undefined : findSpell(staticData, spellId);
  return {
    src:
      staticData === undefined || spell === undefined
        ? null
        : spellImageUrl(staticData.version, spell),
    name: spell?.name,
  };
}

/** A rune or a tree of runes (a `runes` of a match). */
export function runeThing(
  staticData: StaticData | undefined,
  runeId: number,
): GameThing {
  const rune =
    staticData === undefined ? undefined : findRune(staticData, runeId);
  return {
    src: rune === undefined ? null : runeImageUrl(rune),
    name: rune?.name,
  };
}

/** An item. The file is named by the ID: the image is known even if the name is not. */
export function itemThing(
  staticData: StaticData | undefined,
  itemId: number,
): GameThing {
  return {
    src:
      staticData === undefined
        ? null
        : itemImageUrl(staticData.version, itemId),
    name:
      staticData === undefined ? undefined : findItemName(staticData, itemId),
  };
}
