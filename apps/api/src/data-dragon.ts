import {
  championSchema,
  itemSchema,
  runeSchema,
  staticDataSchema,
  summonerSpellSchema,
  type StaticData,
} from '@statslol/shared';
import { z } from 'zod';

// Riot's CDN for the files of the game (images, list of champions...): no key, no rate limit.
const DATA_DRAGON_URL = 'https://ddragon.leagueoflegends.com';
// Champion names in English, like the rest of the site for now.
const LOCALE = 'en_US';

/** Data Dragon could not be reached, or its answer cannot be used. */
export class DataDragonError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DataDragonError';
  }
}

// Every version ever released, the latest first: ["16.19.1", "16.18.1", ...]. Only the first
// one is checked: the oldest ones have other formats ("lolpatch_3.7").
const versionsSchema = z.tuple([staticDataSchema.shape.version], z.unknown());

// champion.json: one entry per champion, with its stats, tags, blurb...; only what the site
// uses is read. `key` is the champion ID used by the Riot API (e.g. "62" for Wukong).
const championsFileSchema = z.object({
  data: z.record(
    z.string(),
    z.object({
      id: championSchema.shape.id,
      key: z.string().regex(/^\d+$/),
      name: z.string(),
    }),
  ),
});

// item.json: one entry per item, by item ID, with its price, stats, description, recipe...;
// only the name is read. (The image of an item is <ID>.png: its ID is all that is needed.)
const itemsFileSchema = z.object({
  data: z.record(z.string().regex(/^\d+$/), itemSchema),
});

// summoner.json: one entry per summoner spell, by spell ID ("SummonerFlash"). `key` is the
// number used by the Riot API (e.g. "4" for Flash).
const summonerSpellsFileSchema = z.object({
  data: z.record(
    z.string(),
    z.object({
      id: summonerSpellSchema.shape.id,
      key: z.string().regex(/^\d+$/),
      name: z.string(),
    }),
  ),
});

// runesReforged.json: the trees (Precision, Domination...), each with its slots of runes.
const runesFileSchema = z.array(
  z.object({
    id: z.number().int().positive(),
    name: z.string(),
    icon: runeSchema.shape.icon,
    slots: z.array(
      z.object({
        runes: z.array(
          z.object({
            id: z.number().int().positive(),
            name: z.string(),
            icon: runeSchema.shape.icon,
          }),
        ),
      }),
    ),
  }),
);

export interface DataDragonClient {
  /**
   * The latest version of Data Dragon's files, with the champions, items, summoner spells
   * and runes it knows.
   */
  getStaticData(): Promise<StaticData>;
}

export interface DataDragonClientOptions {
  /** Longest wait for each answer of Data Dragon, body included. */
  readonly timeoutMs?: number;
}

export function createDataDragonClient({
  timeoutMs = 5000,
}: DataDragonClientOptions = {}): DataDragonClient {
  async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    try {
      const response = await fetch(`${DATA_DRAGON_URL}${path}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new DataDragonError(
          `Data Dragon answered ${String(response.status)} for ${path}`,
        );
      }
      const result = schema.safeParse(await response.json());
      if (!result.success) {
        throw new DataDragonError(
          `Unexpected answer of Data Dragon for ${path}`,
          {
            cause: result.error,
          },
        );
      }
      return result.data;
    } catch (error) {
      if (error instanceof DataDragonError) throw error;
      // Network failure, timeout, or a body that is not JSON.
      throw new DataDragonError(`No usable answer of Data Dragon for ${path}`, {
        cause: error,
      });
    }
  }

  return {
    async getStaticData() {
      const [version] = await get('/api/versions.json', versionsSchema);
      const file = (name: string) =>
        `/cdn/${version}/data/${LOCALE}/${name}.json`;
      // Four files of the same version: asked at the same time.
      const [champions, items, spells, runeTrees] = await Promise.all([
        get(file('champion'), championsFileSchema),
        get(file('item'), itemsFileSchema),
        get(file('summoner'), summonerSpellsFileSchema),
        get(file('runesReforged'), runesFileSchema),
      ]);
      // The trees and their runes share one table: their IDs never clash (8000 is a tree,
      // 8008 a rune).
      const runes: StaticData['runes'] = {};
      for (const tree of runeTrees) {
        runes[tree.id] = { name: tree.name, icon: tree.icon };
        for (const { runes: slotRunes } of tree.slots) {
          for (const { id, name, icon } of slotRunes) {
            runes[id] = { name, icon };
          }
        }
      }
      return {
        version,
        champions: Object.fromEntries(
          Object.values(champions.data).map(({ id, key, name }) => [
            key,
            { id, name },
          ]),
        ),
        items: items.data,
        summonerSpells: Object.fromEntries(
          Object.values(spells.data).map(({ id, key, name }) => [
            key,
            { id, name },
          ]),
        ),
        runes,
      };
    },
  };
}
