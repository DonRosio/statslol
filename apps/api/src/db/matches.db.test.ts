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

describe('match store, games of a player', () => {
  /** A match of these PUUIDs, started at this time (ms): a larger number is more recent. */
  function played(id: string, startedAt: number, puuids: string[]) {
    const match = fakeMatch(id);
    const [first, ...others] = match.info.participants;
    return {
      ...match,
      metadata: { ...match.metadata, participants: puuids },
      info: {
        ...match.info,
        gameStartTimestamp: startedAt,
        // The first participant is the one the test looks for.
        participants: [{ ...first, puuid: puuids[0] ?? 'nobody' }, ...others],
      },
    } as ReturnType<typeof fakeMatch>;
  }

  const ALL_TIME = { fromMs: 0, toMs: 9_999_999_999_999 };

  async function ids(puuid: string, period = ALL_TIME, generation = 1) {
    const games = await store.findPlayerGames(puuid, generation, period);
    return games.map((game) => game.participant.championName);
  }

  it('gives the line of the player in each of their matches, the most recent first', async () => {
    await store.save(played('EUW1_101', 1000, ['a', 'b']), 1);
    await store.save(played('EUW1_102', 3000, ['a', 'c']), 1);
    await store.save(played('EUW1_103', 2000, ['d', 'a']), 1);

    const games = await store.findPlayerGames('a', 1, ALL_TIME);

    // 103 lists 'd' first, so its first participant is not 'a': only 101 and 102 hold a
    // line with puuid 'a'.
    expect(games.map((game) => game.queueId)).toEqual([420, 420]);
    expect(games[0]?.participant).toMatchObject({
      puuid: 'a',
      championName: 'Sylas',
      kills: 7,
    });
    expect(games[0]?.gameDuration).toBe(1834);
    expect(games[0]?.gameEndTimestamp).toBeGreaterThan(0);
    expect(await ids('nobody')).toEqual([]);
  });

  it('keeps the matches that started inside the period, the start included and the end excluded', async () => {
    await store.save(played('EUW1_111', 1000, ['p']), 1);
    await store.save(played('EUW1_112', 2000, ['p']), 1);
    await store.save(played('EUW1_113', 3000, ['p']), 1);

    const inPeriod = await store.findPlayerGames('p', 1, {
      fromMs: 2000,
      toMs: 3000,
    });

    expect(inPeriod).toHaveLength(1);
    expect(
      (await store.findPlayerGames('p', 1, { fromMs: 0, toMs: 9_999 })).length,
    ).toBe(3);
  });

  it('leaves out the matches of another key generation', async () => {
    await store.save(played('EUW1_121', 5000, ['gen']), 1);
    await store.save(played('EUW1_122', 6000, ['gen']), 2);

    expect(await store.findPlayerGames('gen', 1, ALL_TIME)).toHaveLength(1);
    expect(await store.findPlayerGames('gen', 2, ALL_TIME)).toHaveLength(1);
    expect(await store.findPlayerGames('gen', 3, ALL_TIME)).toHaveLength(0);
  });

  it('uses the index of the players of a match', async () => {
    await withClient(database.owner, async (client) => {
      await client.query('SET enable_seqscan = off');
      const plan = await client.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN SELECT id FROM matches WHERE data -> 'metadata' -> 'participants' @> '["x"]'::jsonb`,
      );
      expect(plan.rows.map((row) => row['QUERY PLAN']).join('\n')).toContain(
        'matches_participants_idx',
      );
    });
  });
});
