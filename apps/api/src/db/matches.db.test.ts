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

describe('match store, by player', () => {
  /** A match played by these PUUIDs, started at this time (ms): a larger number is more recent. */
  function played(id: string, startedAt: number, puuids: string[]) {
    const match = fakeMatch(id);
    return {
      ...match,
      metadata: { ...match.metadata, participants: puuids },
      info: { ...match.info, gameStartTimestamp: startedAt },
    };
  }

  it('finds the matches of a player, the most recent first, up to the limit', async () => {
    await store.save(played('EUW1_101', 1000, ['a', 'b']), 1);
    await store.save(played('EUW1_102', 3000, ['b', 'c']), 1);
    await store.save(played('EUW1_103', 2000, ['b', 'd']), 1);
    await store.save(played('EUW1_104', 4000, ['a', 'c']), 1);

    const ids = async (puuid: string, limit: number) =>
      (await store.findByPuuid(puuid, 1, limit)).map((m) => m.metadata.matchId);

    expect(await ids('b', 10)).toEqual(['EUW1_102', 'EUW1_103', 'EUW1_101']);
    expect(await ids('b', 2)).toEqual(['EUW1_102', 'EUW1_103']);
    expect(await ids('a', 10)).toEqual(['EUW1_104', 'EUW1_101']);
    expect(await ids('nobody', 10)).toEqual([]);
  });

  it('leaves out the matches of another key generation', async () => {
    await store.save(played('EUW1_201', 5000, ['gen']), 1);
    await store.save(played('EUW1_202', 6000, ['gen']), 2);

    const found = await store.findByPuuid('gen', 1, 10);

    expect(found.map((m) => m.metadata.matchId)).toEqual(['EUW1_201']);
  });
});
