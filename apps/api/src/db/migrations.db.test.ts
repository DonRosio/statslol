import { eq } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations, MIGRATIONS_FOLDER } from './migrations.ts';
import { matches } from './schema.ts';
import {
  createTestDatabase,
  withClient,
  type TestDatabase,
} from './test-database.ts';

// PostgreSQL's error code when a role lacks a privilege.
const INSUFFICIENT_PRIVILEGE = '42501';

describe('migrations', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.drop();
  });

  it('apply to an empty database, then have nothing left to do', async () => {
    const { length } = readMigrationFiles({
      migrationsFolder: MIGRATIONS_FOLDER,
    });

    expect(await applyMigrations(database.owner)).toBe(length);
    expect(await applyMigrations(database.owner)).toBe(0);
  });
});

describe('the role of the API', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
    await applyMigrations(database.owner);
  });
  afterAll(async () => {
    await database.drop();
  });

  it('reads and writes rows', async () => {
    await withClient(database.app, async (client) => {
      const db = drizzle({ client });
      const id = 'EUW1_7123456789';

      await db.insert(matches).values({
        id,
        keyGeneration: 1,
        data: { info: { gameDuration: 1800 } },
      });
      await db
        .update(matches)
        .set({ keyGeneration: 2 })
        .where(eq(matches.id, id));

      expect(await db.select().from(matches)).toMatchObject([
        { id, keyGeneration: 2, data: { info: { gameDuration: 1800 } } },
      ]);

      await db.delete(matches).where(eq(matches.id, id));
      expect(await db.select().from(matches)).toEqual([]);
    });
  });

  it.each([
    ['create a table', 'CREATE TABLE players (puuid text)'],
    ['alter a table', 'ALTER TABLE matches ADD COLUMN notes text'],
    ['drop a table', 'DROP TABLE matches'],
    ['empty a table at once', 'TRUNCATE matches'],
    ['create a schema', 'CREATE SCHEMA other'],
    [
      'read the migration journal',
      'SELECT * FROM drizzle.__drizzle_migrations',
    ],
    // Only superusers may: with SQL injection, it would run any command on the server.
    ['run a program on the server', "COPY matches TO PROGRAM 'id'"],
  ])('cannot %s', async (_action, statement) => {
    await expect(
      withClient(database.app, (client) => client.query(statement)),
    ).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });
});
