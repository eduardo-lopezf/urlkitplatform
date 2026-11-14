/**
 * Backup and restore (003/T045, FR-044, SC-007): the procedure of infrastructure/README.md,
 * "Copias de seguridad". Runs only with DATABASE_URL and PostgreSQL client tools of the server's
 * major version:
 * - PG_TOOLS: command prefix that runs them, e.g. `docker compose exec -T postgres` locally or
 *   `docker run --rm -i --network host postgres:17-alpine` in CI;
 * - PG_TOOLS_HOST: host:port the tools must use, when it differs from DATABASE_URL's;
 * - otherwise `pg_dump` and `pg_restore` from the PATH.
 */
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKey, hashSecret } from '../../src/auth/key-format.ts';
import { createKeyVerifier } from '../../src/auth/verify.ts';
import { createDb, type Db } from '../../src/db/client.ts';
import { createPgKeyStore } from '../../src/db/key-store.ts';
import { migrateToLatest } from '../../src/db/migrate.ts';
import { DATABASE_URL, freshDatabase, type TestDatabase } from '../db.ts';

const PREFIX = process.env.PG_TOOLS?.split(' ').filter(Boolean) ?? [];

function tool(name: 'pg_dump' | 'pg_restore', args: string[], input?: Buffer): Buffer {
  const [command = name, ...rest] = PREFIX.length ? [...PREFIX, name] : [name];
  return execFileSync(command, [...rest, ...args], {
    ...(input ? { input } : {}),
    maxBuffer: 64 * 1024 * 1024,
  });
}

function available(): boolean {
  if (!DATABASE_URL) return false;
  try {
    return /\b17\./.test(tool('pg_dump', ['--version']).toString());
  } catch {
    return false;
  }
}

/** The URL the tools use: same database, possibly another host as seen from where they run. */
function toolUrl(url: string): string {
  const out = new URL(url);
  if (process.env.PG_TOOLS_HOST) out.host = process.env.PG_TOOLS_HOST;
  return out.href;
}

describe.skipIf(!available())('backup and restore (003, SC-007)', () => {
  let source: TestDatabase;
  let target: TestDatabase;
  let db: Db;
  let restored: Db;

  beforeAll(async () => {
    source = await freshDatabase();
    target = await freshDatabase();
    db = createDb(source.url);
    await migrateToLatest(db.kysely);
  });

  afterAll(async () => {
    await db?.close();
    await restored?.close();
    await source?.drop();
    await target?.drop();
  });

  it('restores into an empty database with active keys working and revoked ones revoked', async () => {
    const store = createPgKeyStore(db.kysely);
    const org = await store.createOrganization({ name: 'Backup', planId: 'organization' });
    const active = generateKey();
    const revoked = generateKey();
    await store.createKey(org.id, active.id, hashSecret(active.secret));
    await store.createKey(org.id, revoked.id, hashSecret(revoked.secret));
    await store.revokeKey(revoked.id);

    const dump = tool('pg_dump', ['--format=custom', `--dbname=${toolUrl(source.url)}`]);
    tool('pg_restore', ['--no-owner', `--dbname=${toolUrl(target.url)}`], dump);

    restored = createDb(target.url);
    const verifier = createKeyVerifier({ store: createPgKeyStore(restored.kysely) });
    expect(await verifier.verify(`Bearer ${active.key}`)).toMatchObject({
      kind: 'valid',
      organizationId: org.id,
      planId: 'organization',
    });
    expect(await verifier.verify(`Bearer ${revoked.key}`)).toEqual({ kind: 'invalid' });
    // The restored schema is current: no migration is pending.
    await migrateToLatest(restored.kysely);
  });
});
