import { z } from 'zod';

/** Answer of GET /api/health while the API is up. */
export const healthSchema = z.object({
  status: z.literal('ok'),
});

export type Health = z.infer<typeof healthSchema>;
