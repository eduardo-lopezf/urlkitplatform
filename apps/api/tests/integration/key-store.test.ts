/**
 * The PostgreSQL KeyStore has the same behaviour as MemoryKeyStore (003/T017). Runs only with
 * DATABASE_URL; each test gets an empty, migrated database.
 */
import pg from 'pg';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { generateKey, hashSecret } from '../../src/auth/key-format.ts';
import { createDb, type Db } from '../../src/db/client.ts';
import { createPgKeyStore } from '../../src/db/key-store.ts';
import { migrateToLatest } from '../../src/db/migrate.ts';
import { DATABASE_URL, freshDatabase, type TestDatabase } from '../db.ts';
import { keyStoreBehaviour } from '../key-store-behaviour.ts';
import { skipUnless } from '../requires.ts';

describe.skipIf(skipUnless(Boolean(DATABASE_URL), 'DATABASE_URL'))('PostgreSQL KeyStore', () => {
  const open: Array<{ database: TestDatabase; db: Db }> = [];

  async function make() {
    const database = await freshDatabase();
    const db = createDb(database.url);
    await migrateToLatest(db.kysely);
    open.push({ database, db });
    return { db, database, store: createPgKeyStore(db.kysely) };
  }

  afterEach(async () => {
    for (const { db, database } of open.splice(0)) {
      await db.close();
      await database.drop();
    }
  });
  afterAll(async () => {
    for (const { db, database } of open.splice(0)) {
      await db.close();
      await database.drop();
    }
  });

  keyStoreBehaviour(async () => (await make()).store);

  it('keeps only the 32-byte hash in api_keys', async () => {
    const { store, database } = await make();
    const org = await store.createOrganization({ name: 'Hash', planId: 'organization' });
    const key = generateKey();
    await store.createKey(org.id, key.id, hashSecret(key.secret));
    const raw = new pg.Client({ connectionString: database.url });
    await raw.connect();
    const { rows } = await raw.query('SELECT * FROM api_keys');
    await raw.end();
    expect(rows).toHaveLength(1);
    expect(Buffer.from(rows[0].secret_hash).length).toBe(32);
    expect(JSON.stringify(rows)).not.toContain(key.secret);
  });
});
