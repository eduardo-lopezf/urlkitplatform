/**
 * Admin CLI against a real PostgreSQL (003, contracts/admin-cli.md). Runs only with DATABASE_URL.
 * The CLI is driven through `runCli`, the same function `node src/admin/cli.ts` calls.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCli } from '../../src/admin/cli.ts';
import { createKeyVerifier } from '../../src/auth/verify.ts';
import { createDb, type Db } from '../../src/db/client.ts';
import { createPgKeyStore } from '../../src/db/key-store.ts';
import { migrateToLatest } from '../../src/db/migrate.ts';
import { createPgUsageStore } from '../../src/db/usage-store.ts';
import { PLAN_LIST } from '../../src/quota/plans.ts';
import { DATABASE_URL, freshDatabase, type TestDatabase } from '../db.ts';

describe.skipIf(!DATABASE_URL)('admin CLI (003)', () => {
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

  async function cli(...argv: string[]) {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(argv, {
      store: createPgKeyStore(db.kysely),
      usage: createPgUsageStore(db.kysely),
      plans: PLAN_LIST,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    });
    return { code, out: out.join('\n'), err: err.join('\n') };
  }
  const json = async (...argv: string[]) => {
    const result = await cli(...argv, '--json');
    expect(result.code, result.err).toBe(0);
    return JSON.parse(result.out) as Record<string, unknown>;
  };

  describe('US1: organizations and keys (FR-001–FR-004)', () => {
    it('creates an organization, and rejects a repeated name or an unknown plan', async () => {
      const org = await json('org', 'create', '--name', 'Acme', '--plan', 'organization');
      expect(org).toMatchObject({ name: 'Acme', plan: 'organization', status: 'active' });
      for (const argv of [
        ['org', 'create', '--name', 'ACME', '--plan', 'organization'],
        ['org', 'create', '--name', 'Other', '--plan', 'gold'],
        ['org', 'create', '--plan', 'organization'],
        ['org', 'frobnicate'],
      ]) {
        const result = await cli(...argv);
        expect(result.code, argv.join(' ')).toBe(1);
        expect(result.err, argv.join(' ')).not.toBe('');
      }
      const list = (await json('org', 'list')) as unknown as { organizations: unknown[] };
      expect(list.organizations).toMatchObject([{ name: 'Acme', activeKeys: 0 }]);
    });

    it('prints a new key once, and that key verifies', async () => {
      const created = await json('key', 'create', 'Acme');
      expect(created.key).toMatch(/^uk_[0-9a-hjkmnp-tv-z]{12}_[A-Za-z0-9_-]{43}$/);
      expect(created.id).toBe(String(created.key).split('_')[1]);
      const text = await cli('key', 'create', 'Acme');
      expect(text.code).toBe(0);
      expect(text.out).toMatch(/uk_\S+/);
      expect(text.out).toMatch(/no se volverá a mostrar/);
      const verifier = createKeyVerifier({ store: createPgKeyStore(db.kysely) });
      expect(await verifier.verify(`Bearer ${String(created.key)}`)).toMatchObject({
        kind: 'valid',
        planId: 'organization',
      });
    });

    it('lists keys with id and dates, never the secret', async () => {
      const created = await json('key', 'create', 'Acme');
      const listed = (await json('key', 'list', 'Acme')) as unknown as {
        keys: Array<Record<string, unknown>>;
      };
      expect(listed.keys.map((k) => k.id)).toContain(created.id);
      for (const key of listed.keys)
        expect(Object.keys(key).sort()).toEqual(['createdAt', 'id', 'revokedAt']);
      const secret = String(created.key).split('_').slice(2).join('_');
      expect(JSON.stringify(listed)).not.toContain(secret);
      expect((await cli('key', 'list', 'Acme')).out).not.toContain(secret);
    });

    it('fails with exit code 1 for an organization that does not exist', async () => {
      expect((await cli('key', 'create', 'Nobody')).code).toBe(1);
      expect((await cli('key', 'list', 'Nobody')).code).toBe(1);
    });
  });

  describe('US2: plans (FR-022)', () => {
    it('lists the plans of plans.json', async () => {
      const plans = (await json('plans', 'list')) as unknown as { plans: Array<{ id: string }> };
      expect(plans.plans.map((p) => p.id)).toEqual(['anonymous', 'organization']);
    });

    it('changes the plan of an organization, and rejects an unknown one', async () => {
      await json('org', 'create', '--name', 'Planned', '--plan', 'organization');
      const changed = await json('org', 'set-plan', 'Planned', '--plan', 'anonymous');
      expect(changed).toMatchObject({ previous: 'organization', plan: 'anonymous' });
      expect((await cli('org', 'set-plan', 'Planned', '--plan', 'gold')).code).toBe(1);
      expect((await createPgKeyStore(db.kysely).findOrganization('Planned'))?.planId).toBe(
        'anonymous',
      );
    });
  });

  describe('US3: revocation, deactivation and usage (FR-006, FR-013, FR-031, FR-032)', () => {
    it('revokes a key for good, idempotently, and lists it as revoked', async () => {
      await json('org', 'create', '--name', 'Rev', '--plan', 'organization');
      const key = await json('key', 'create', 'Rev');
      const revoked = await json('key', 'revoke', String(key.id));
      expect(revoked.revokedAt).toEqual(expect.any(String));
      const again = await json('key', 'revoke', String(key.id));
      expect(again.revokedAt).toBe(revoked.revokedAt);
      expect((await cli('key', 'revoke', 'zzzzzzzzzzzz')).code).toBe(1);
      const listed = (await json('key', 'list', 'Rev')) as unknown as {
        keys: Array<{ id: string; revokedAt: string | null }>;
      };
      expect(listed.keys.find((k) => k.id === key.id)?.revokedAt).toBe(revoked.revokedAt);
    });

    it('deactivates and reactivates an organization, effective in under a minute', async () => {
      await json('org', 'create', '--name', 'Toggle', '--plan', 'organization');
      const key = await json('key', 'create', 'Toggle');
      let now = Date.now();
      const verifier = createKeyVerifier({ store: createPgKeyStore(db.kysely), now: () => now });
      const verify = () => verifier.verify(`Bearer ${String(key.key)}`);
      expect((await verify()).kind).toBe('valid');
      expect(await json('org', 'deactivate', 'Toggle')).toMatchObject({ status: 'inactive' });
      expect((await verify()).kind).toBe('valid'); // cached
      now += 31_000;
      expect((await verify()).kind).toBe('invalid'); // seen within the minute (SC-003)
      const all = (await json('org', 'list', '--all')) as unknown as {
        organizations: Array<{ name: string; status: string }>;
      };
      expect(all.organizations.find((o) => o.name === 'Toggle')?.status).toBe('inactive');
      expect(await json('org', 'activate', 'Toggle')).toMatchObject({ status: 'active' });
      now += 31_000;
      expect((await verify()).kind).toBe('valid');
    });

    it('shows usage per day, key and bucket with a total, without URLs or IPs', async () => {
      const org = await json('org', 'create', '--name', 'Used', '--plan', 'organization');
      const key = await json('key', 'create', 'Used');
      const usage = createPgUsageStore(db.kysely);
      for (const [day, bucket] of [
        ['2026-11-12', 'inspect'],
        ['2026-11-12', 'inspect'],
        ['2026-11-13', 'local'],
      ] as const)
        await usage.add(day, String(org.id), String(key.id), bucket);
      const shown = (await json('usage', 'show', 'Used')) as unknown as {
        rows: Array<{ day: string; keyId: string; bucket: string; count: number }>;
        total: number;
      };
      expect(shown.total).toBe(3);
      expect(shown.rows).toEqual([
        { day: '2026-11-12', keyId: key.id, bucket: 'inspect', count: 2 },
        { day: '2026-11-13', keyId: key.id, bucket: 'local', count: 1 },
      ]);
      const filtered = (await json('usage', 'show', 'Used', '--from', '2026-11-13')) as unknown as {
        total: number;
      };
      expect(filtered.total).toBe(1);
      expect((await cli('usage', 'show', 'Used')).out).not.toMatch(/https?:|\d+\.\d+\.\d+\.\d+/);
    });

    it('prunes usage older than 13 months', async () => {
      const org = await json('org', 'create', '--name', 'Old', '--plan', 'organization');
      const key = await json('key', 'create', 'Old');
      await createPgUsageStore(db.kysely).add(
        '2020-01-01',
        String(org.id),
        String(key.id),
        'inspect',
      );
      const pruned = await json('usage', 'prune');
      expect(pruned.deleted).toBeGreaterThanOrEqual(1);
      expect(((await json('usage', 'show', 'Old')) as unknown as { total: number }).total).toBe(0);
    });
  });
});
