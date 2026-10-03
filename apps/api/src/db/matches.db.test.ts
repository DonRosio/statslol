import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLogger } from '../test-logger.ts';
import { fakeMatch } from '../test-matches.ts';
import { createDatabase } from './database.ts';
import { createMatchStore, type MatchStore } from './matches.ts';
import { applyMigrations } from './migrations.ts';
import {
  createTestDatabase,
  withClient,
  type TestDatabase,
} from './test-database.ts';

let database: TestDatabase;
let closePool: () => Promise<void>;
let store: MatchStore;

beforeAll(async () => {
  database = await createTestDatabase();
  await applyMigrations(database.owner);
  // As the role of the API: this also checks the rights the migrations gave it.
  const { db, close } = createDatabase(database.app, fakeLogger());
  closePool = close;
  store = createMatchStore(db);
});
afterAll(async () => {
  await closePool();
  await database.drop();
});

/** The rows of the matches table, read as the owner. */
async function rows(): Promise<{ id: string; key_generation: number }[]> {
  const result = await withClient(database.owner, (client) =>
    client.query<{ id: string; key_generation: number }>(
      'SELECT id, key_generation FROM matches ORDER BY id',
    ),
  );
  return result.rows;
}

describe('match store', () => {
  it('stores a match once, with every field Riot sent', async () => {
    await store.save(fakeMatch('EUW1_1'), 1);
    await store.save(fakeMatch('EUW1_1'), 1);

    const found = await store.findMany(['EUW1_1', 'EUW1_404'], 1);

    expect([...found.keys()]).toEqual(['EUW1_1']);
    expect(found.get('EUW1_1')).toEqual(fakeMatch('EUW1_1'));
    expect(await rows()).toEqual([{ id: 'EUW1_1', key_generation: 1 }]);
  });

  it('leaves out a match of another key generation, which a new save replaces', async () => {
    await store.save(fakeMatch('EUW1_2'), 1);

    expect((await store.findMany(['EUW1_2'], 2)).size).toBe(0);
    await store.save(fakeMatch('EUW1_2'), 2);

    expect((await store.findMany(['EUW1_2'], 2)).size).toBe(1);
    expect(await rows()).toContainEqual({ id: 'EUW1_2', key_generation: 2 });
  });

  it('leaves out a stored match that no longer fits the schema', async () => {
    await withClient(database.owner, (client) =>
      client.query(
        `INSERT INTO matches (id, key_generation, data) VALUES ('EUW1_3', 1, '{"metadata": {}}')`,
      ),
    );

    expect((await store.findMany(['EUW1_3'], 1)).size).toBe(0);
  });

  it('finds nothing for no IDs', async () => {
    expect((await store.findMany([], 1)).size).toBe(0);
  });
});
