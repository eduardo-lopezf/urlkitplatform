/**
 * Schema of the first persistence (003/T007, data-model.md). Runs only with DATABASE_URL.
 * The migration and the Kysely `Database` interface must not diverge: the expected columns below
 * are typed against the interface, and the test compares them with the migrated schema.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../src/db/client.ts';
import { migrateDown, migrateToLatest } from '../../src/db/migrate.ts';
import type { ApiKeysTable, OrganizationsTable, UsageDailyTable } from '../../src/db/schema.ts';
import { DATABASE_URL, freshDatabase, type TestDatabase } from '../db.ts';
import { skipUnless } from '../requires.ts';

/** Column → PostgreSQL type. `satisfies` fails to compile if a column is added or removed. */
const ORGANIZATIONS = {
  id: 'uuid',
  name: 'text',
  note: 'text',
  plan_id: 'text',
  status: 'text',
  created_at: 'timestamp with time zone',
  deactivated_at: 'timestamp with time zone',
} satisfies Record<keyof OrganizationsTable, string>;
const API_KEYS = {
  id: 'text',
  organization_id: 'uuid',
  secret_hash: 'bytea',
  created_at: 'timestamp with time zone',
  revoked_at: 'timestamp with time zone',
} satisfies Record<keyof ApiKeysTable, string>;
const USAGE_DAILY = {
  day: 'date',
  organization_id: 'uuid',
  key_id: 'text',
  bucket: 'text',
  count: 'integer',
} satisfies Record<keyof UsageDailyTable, string>;

const HASH = Buffer.alloc(32, 1);

describe.skipIf(skipUnless(Boolean(DATABASE_URL), 'DATABASE_URL'))('database schema (003)', () => {
  let database: TestDatabase;
  let db: Db;
  let raw: pg.Client;

  beforeAll(async () => {
    database = await freshDatabase();
    db = createDb(database.url);
    raw = new pg.Client({ connectionString: database.url });
    await raw.connect();
  });

  afterAll(async () => {
    await raw?.end();
    await db?.close();
    await database?.drop();
  });

  async function columns(table: string) {
    const { rows } = await raw.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    return Object.fromEntries(rows.map((r) => [r.column_name, r.data_type]));
  }

  async function tables() {
    const { rows } = await raw.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name NOT LIKE 'kysely_%'`,
    );
    return rows.map((r) => r.table_name).sort();
  }

  it('creates exactly the three tables of data-model.md, with the interface columns', async () => {
    await migrateToLatest(db.kysely);
    expect(await tables()).toEqual(['api_keys', 'organizations', 'usage_daily']);
    expect(await columns('organizations')).toEqual(ORGANIZATIONS);
    expect(await columns('api_keys')).toEqual(API_KEYS);
    expect(await columns('usage_daily')).toEqual(USAGE_DAILY);
  });

  it('has no column that could hold a URL, an IP, a secret or contact data (FR-040, FR-041)', async () => {
    const all = [
      ...Object.keys(ORGANIZATIONS),
      ...Object.keys(API_KEYS),
      ...Object.keys(USAGE_DAILY),
    ];
    for (const name of all)
      expect(name).not.toMatch(/url|uri|query|^ip$|_ip$|address|^secret$|email|phone|contact/);
  });

  it('enforces the rules of data-model.md', async () => {
    const org = await raw.query<{ id: string }>(
      `INSERT INTO organizations (name, plan_id) VALUES ('Acme', 'organization') RETURNING id`,
    );
    const orgId = org.rows[0]?.id;
    const reject = (text: string, values: unknown[] = []) =>
      expect(raw.query(text, values)).rejects.toThrow();

    // Names are unique without regard to case, and bounded.
    await reject(`INSERT INTO organizations (name, plan_id) VALUES ('ACME', 'organization')`);
    await reject(`INSERT INTO organizations (name, plan_id) VALUES ('', 'organization')`);
    await reject(
      `INSERT INTO organizations (name, plan_id, note) VALUES ('N', 'p', repeat('x', 501))`,
    );
    // Status and its date go together.
    await reject(`UPDATE organizations SET status = 'paused' WHERE id = $1`, [orgId]);
    await reject(`UPDATE organizations SET status = 'inactive' WHERE id = $1`, [orgId]);
    // Key ids are 12 lower-case Crockford base32 characters; hashes are 32 bytes.
    await reject(
      `INSERT INTO api_keys (id, organization_id, secret_hash) VALUES ('short', $1, $2)`,
      [orgId, HASH],
    );
    await reject(
      `INSERT INTO api_keys (id, organization_id, secret_hash) VALUES ('abcdefghjkmn', $1, $2)`,
      [orgId, Buffer.alloc(31)],
    );
    await raw.query(
      `INSERT INTO api_keys (id, organization_id, secret_hash) VALUES ('abcdefghjkmn', $1, $2)`,
      [orgId, HASH],
    );
    // Usage counts are positive and unique per day, key and bucket.
    await reject(
      `INSERT INTO usage_daily (day, organization_id, key_id, bucket, count)
       VALUES ('2026-11-13', $1, 'abcdefghjkmn', 'inspect', 0)`,
      [orgId],
    );
    await raw.query(
      `INSERT INTO usage_daily (day, organization_id, key_id, bucket, count)
       VALUES ('2026-11-13', $1, 'abcdefghjkmn', 'inspect', 1)`,
      [orgId],
    );
    await reject(
      `INSERT INTO usage_daily (day, organization_id, key_id, bucket, count)
       VALUES ('2026-11-13', $1, 'abcdefghjkmn', 'inspect', 1)`,
      [orgId],
    );
  });

  it('migrates down to an empty schema', async () => {
    await migrateDown(db.kysely);
    expect(await tables()).toEqual([]);
  });
});
