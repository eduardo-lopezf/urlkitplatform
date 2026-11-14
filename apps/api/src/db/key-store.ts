/**
 * PostgreSQL KeyStore (003, data-model.md). Same behaviour as MemoryKeyStore
 * (tests/key-store-behaviour.ts). Every change is a single statement, so it is atomic.
 */
import { sql, type Kysely } from 'kysely';
import {
  DuplicateNameError,
  type KeyStore,
  type KeySummary,
  type Organization,
} from '../auth/key-store.ts';
import type { Database } from './schema.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = '23505';

type OrgRow = {
  id: string;
  name: string;
  note: string | null;
  plan_id: string;
  status: 'active' | 'inactive';
  created_at: Date;
  deactivated_at: Date | null;
};

const toOrganization = (row: OrgRow): Organization => ({
  id: row.id,
  name: row.name,
  note: row.note,
  planId: row.plan_id,
  status: row.status,
  createdAt: row.created_at,
  deactivatedAt: row.deactivated_at,
});

const toKey = (row: {
  id: string;
  organization_id: string;
  created_at: Date;
  revoked_at: Date | null;
}): KeySummary => ({
  id: row.id,
  organizationId: row.organization_id,
  createdAt: row.created_at,
  revokedAt: row.revoked_at,
});

export function createPgKeyStore(db: Kysely<Database>): KeyStore {
  return {
    async findKey(id) {
      const row = await db
        .selectFrom('api_keys as k')
        .innerJoin('organizations as o', 'o.id', 'k.organization_id')
        .select([
          'k.id',
          'k.organization_id',
          'k.secret_hash',
          'k.created_at',
          'k.revoked_at',
          'o.status',
          'o.plan_id',
        ])
        .where('k.id', '=', id)
        .executeTakeFirst();
      if (!row) return null;
      return {
        ...toKey(row),
        secretHash: Buffer.from(row.secret_hash),
        organizationStatus: row.status,
        planId: row.plan_id,
      };
    },

    async createOrganization({ name, planId, note }) {
      try {
        const row = await db
          .insertInto('organizations')
          .values({ name, plan_id: planId, note: note ?? null })
          .returningAll()
          .executeTakeFirstOrThrow();
        return toOrganization(row);
      } catch (error) {
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw new DuplicateNameError();
        throw error;
      }
    },

    async findOrganization(ref) {
      const row = await db
        .selectFrom('organizations')
        .selectAll()
        .where((eb) => (UUID.test(ref) ? eb('id', '=', ref) : eb('name', '=', ref)))
        .executeTakeFirst();
      return row ? toOrganization(row) : null;
    },

    async listOrganizations({ all = false } = {}) {
      const rows = await db
        .selectFrom('organizations as o')
        .selectAll('o')
        .select((eb) =>
          eb
            .selectFrom('api_keys as k')
            .select(sql<number>`count(*)::int`.as('n'))
            .whereRef('k.organization_id', '=', 'o.id')
            .where('k.revoked_at', 'is', null)
            .as('active_keys'),
        )
        .$if(!all, (q) => q.where('o.status', '=', 'active'))
        .orderBy('o.created_at')
        .execute();
      return rows.map((row) => ({ ...toOrganization(row), activeKeys: row.active_keys ?? 0 }));
    },

    async setPlan(organizationId, planId) {
      await db
        .updateTable('organizations')
        .set({ plan_id: planId })
        .where('id', '=', organizationId)
        .execute();
    },

    async setStatus(organizationId, status) {
      await db
        .updateTable('organizations')
        .set({ status, deactivated_at: status === 'inactive' ? sql`now()` : null })
        .where('id', '=', organizationId)
        .execute();
    },

    async createKey(organizationId, id, secretHash) {
      const row = await db
        .insertInto('api_keys')
        .values({ id, organization_id: organizationId, secret_hash: secretHash })
        .returning(['id', 'organization_id', 'created_at', 'revoked_at'])
        .executeTakeFirstOrThrow();
      return toKey(row);
    },

    async listKeys(organizationId) {
      const rows = await db
        .selectFrom('api_keys')
        .select(['id', 'organization_id', 'created_at', 'revoked_at'])
        .where('organization_id', '=', organizationId)
        .orderBy('created_at')
        .execute();
      return rows.map(toKey);
    },

    async revokeKey(id) {
      const row = await db
        .updateTable('api_keys')
        .set({ revoked_at: sql`coalesce(revoked_at, now())` })
        .where('id', '=', id)
        .returning(['id', 'organization_id', 'created_at', 'revoked_at'])
        .executeTakeFirst();
      return row ? toKey(row) : null;
    },
  };
}
