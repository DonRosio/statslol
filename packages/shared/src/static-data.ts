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
 * Answer of GET /api/v1/static-data: what the site needs from Data Dragon, Riot's CDN for
 * the files of the game. The version and the champion IDs go into image URLs: their format
 * is checked so that an unexpected value cannot change where a URL points.
 */
export const staticDataSchema = z.object({
  // Version of Data Dragon's files, e.g. "16.19.1".
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  // By champion ID, the `championId` of matches (as text: the keys of a JSON object).
  champions: z.record(z.string().regex(/^\d+$/), championSchema),
});

export type StaticData = z.infer<typeof staticDataSchema>;
