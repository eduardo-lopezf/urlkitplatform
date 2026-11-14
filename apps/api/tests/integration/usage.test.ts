/**
 * Usage counts (003/T036, research R6, FR-030, FR-033, SC-006). Runs only with DATABASE_URL:
 * requests go through the app with a PostgreSQL key store and usage store.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKey, hashSecret } from '../../src/auth/key-format.ts';
import { createKeyVerifier } from '../../src/auth/verify.ts';
import { createDb, type Db } from '../../src/db/client.ts';
import { createPgKeyStore } from '../../src/db/key-store.ts';
import { migrateToLatest } from '../../src/db/migrate.ts';
import { createPgUsageStore } from '../../src/db/usage-store.ts';
import { createUsageRecorder } from '../../src/usage/record.ts';
import { pruneUsage, usageCutoff } from '../../src/usage/prune.ts';
import { post, T0, testApp } from '../helpers.ts';
import { DATABASE_URL, freshDatabase, type TestDatabase } from '../db.ts';
import { skipUnless } from '../requires.ts';

const URL_IN = 'https://ejemplo.com/secret-path?utm_source=x';
/**
 * The writes are not awaited (research R6): wait until the counts reach the expected rows, then
 * check again a moment later that nothing else arrives.
 */
async function expectCounts(read: () => Promise<unknown>, expected: unknown) {
  await vi.waitFor(async () => expect(await read()).toEqual(expected), {
    timeout: 5000,
    interval: 100,
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(await read()).toEqual(expected);
}

describe.skipIf(skipUnless(Boolean(DATABASE_URL), 'DATABASE_URL'))('usage counts (003)', () => {
  let database: TestDatabase;
  let db: Db;

  beforeAll(async () => {
    database = await freshDatabase();
    db = createDb(database.url);
    await migrateToLatest(db.kysely);
  });

  afterAll(async () => {
    await db?.close();
    await database?.drop();
  });

  async function setup() {
    const store = createPgKeyStore(db.kysely);
    const usage = createPgUsageStore(db.kysely);
    const org = await store.createOrganization({
      name: `Org ${Math.random()}`,
      planId: 'organization',
    });
    const key = generateKey();
    await store.createKey(org.id, key.id, hashSecret(key.secret));
    const harness = testApp({ keyVerifier: createKeyVerifier({ store, now: () => T0 }) });
    const recorder = createUsageRecorder({
      store: usage,
      logger: harness.deps.logger,
      now: harness.deps.now,
    });
    const app = testApp({ ...harness.deps, usageRecorder: recorder });
    return { org, key, usage, app: app.app, lines: harness.lines };
  }

  it('counts each served request with a key by day, key and bucket (FR-030, SC-006)', async () => {
    const { org, key, usage, app } = await setup();
    const auth = { authorization: `Bearer ${key.key}` };
    for (let i = 0; i < 7; i++) await post(app, '/v1/inspect', { url: URL_IN }, auth);
    for (let i = 0; i < 3; i++) await post(app, '/v1/clean', { url: URL_IN }, auth);
    await post(app, '/v1/clean', { url: URL_IN }); // anonymous: not counted
    await expectCounts(
      () => usage.read(org.id),
      [
        { day: '2026-11-06', keyId: key.id, bucket: 'inspect', count: 7 },
        { day: '2026-11-06', keyId: key.id, bucket: 'local', count: 3 },
      ],
    );
  });

  it('does not count requests rejected by quota or with 401', async () => {
    const { org, key, usage, app } = await setup();
    const auth = { authorization: `Bearer ${key.key}` };
    for (let i = 0; i < 102; i++) await post(app, '/v1/inspect', { url: URL_IN }, auth);
    await post(app, '/v1/inspect', { url: URL_IN }, { authorization: 'Bearer nope' });
    await expectCounts(
      () => usage.read(org.id),
      [{ day: '2026-11-06', keyId: key.id, bucket: 'inspect', count: 100 }],
    );
  });

  it('never fails the request when the write fails, and logs no request data', async () => {
    const { key, app, lines } = await setup();
    const broken = createDb('postgres://urlkit:wrong@localhost:1/none');
    const harness = testApp({
      keyVerifier: createKeyVerifier({ store: createPgKeyStore(db.kysely), now: () => T0 }),
    });
    const failing = testApp({
      ...harness.deps,
      usageRecorder: createUsageRecorder({
        store: createPgUsageStore(broken.kysely),
        logger: harness.deps.logger,
        now: harness.deps.now,
      }),
    });
    const res = await post(
      failing.app,
      '/v1/clean',
      { url: URL_IN },
      {
        authorization: `Bearer ${key.key}`,
      },
    );
    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const out = harness.lines.join('\n') + lines.join('\n');
    expect(out).toContain('usage.write-failed');
    for (const needle of [key.key, key.secret, 'secret-path', 'utm_source'])
      expect(out).not.toContain(needle);
    await broken.close();
    void app;
  });

  it('prunes rows older than 13 months and keeps the rest (FR-033)', async () => {
    const { org, key, usage } = await setup();
    expect(usageCutoff(Date.UTC(2026, 10, 13))).toBe('2025-10-13');
    await usage.add('2025-10-12', org.id, key.id, 'inspect');
    await usage.add('2025-10-13', org.id, key.id, 'inspect');
    const deleted = await pruneUsage(usage, Date.UTC(2026, 10, 13));
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect((await usage.read(org.id)).map((r) => r.day)).toEqual(['2025-10-13']);
  });
});
