import { z } from 'zod';

/** A champion, as the site shows it. */
export const championSchema = z.object({
  // Data Dragon's ID, the name of its image files: "MonkeyKing" (MonkeyKing.png).
  id: z.string().regex(/^[A-Za-z0-9]+$/),
  // Name shown to players: "Wukong".
  name: z.string(),
});

export type Champion = z.infer<typeof championSchema>;

/**
 * An item. Its image is `<item ID>.png`, and the ID is the key of the record: no need to
 * repeat it. Data Dragon names a few unreleased or internal items with an empty string.
 */
export const itemSchema = z.object({ name: z.string() });

export type Item = z.infer<typeof itemSchema>;

/** A summoner spell (Flash, Ignite...). */
export const summonerSpellSchema = z.object({
  // Data Dragon's ID, the name of its image file: "SummonerFlash" (SummonerFlash.png). A few
  // have an underscore ("SummonerBarrier_Jade").
  id: z.string().regex(/^[A-Za-z0-9_]+$/),
  // Name shown to players: "Flash".
  name: z.string(),
});

export type SummonerSpell = z.infer<typeof summonerSpellSchema>;

/** A rune, or one of the 5 trees of runes (Precision, Domination...). */
export const runeSchema = z.object({
  name: z.string(),
  // Path of the image under Data Dragon's `cdn/img/`, which is not versioned.
  icon: z.string().regex(/^perk-images\/[A-Za-z0-9_/]+\.png$/),
});

export type Rune = z.infer<typeof runeSchema>;

// Riot's IDs are numbers: the keys of a JSON object are text.
const idKey = z.string().regex(/^\d+$/);

/**
 * Answer of GET /api/v1/static-data: what the site needs from Data Dragon, Riot's CDN for
 * the files of the game. The version, the IDs and the paths go into image URLs: their format
 * is checked so that an unexpected value cannot change where a URL points.
 */
export const staticDataSchema = z.object({
  // Version of Data Dragon's files, e.g. "16.19.1".
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  // By champion ID, the `championId` of matches.
  champions: z.record(idKey, championSchema),
  // By item ID, the `itemIds` of matches.
  items: z.record(idKey, itemSchema),
  // By spell key, the `spellIds` of matches.
  summonerSpells: z.record(idKey, summonerSpellSchema),
  // By rune ID, the `runes` of matches: both the keystones and the trees (their IDs differ).
  runes: z.record(idKey, runeSchema),
});

export type StaticData = z.infer<typeof staticDataSchema>;
