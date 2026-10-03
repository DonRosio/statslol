import { z } from 'zod';

/**
 * League of Legends servers, as written in our URLs (e.g. /api/v1/players/euw/...).
 * The Riot client maps each one to Riot's routing values (euw → euw1 and europe).
 * "sea" is the Southeast Asia server, which absorbed the PH, SG and TH servers in 2025.
 */
export const regionSchema = z.enum([
  'br',
  'eune',
  'euw',
  'jp',
  'kr',
  'lan',
  'las',
  'me',
  'na',
  'oce',
  'ru',
  'sea',
  'tr',
  'tw',
  'vn',
]);

export type Region = z.infer<typeof regionSchema>;

export const DEFAULT_REGION = 'euw' satisfies Region;
