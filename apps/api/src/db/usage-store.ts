/** PostgreSQL usage counts (003, data-model.md `usage_daily`). */
import type { Kysely } from 'kysely';
import type { UsageStore } from '../usage/record.ts';
import type { Database } from './schema.ts';

export function createPgUsageStore(db: Kysely<Database>): UsageStore {
  return {
    async add(day, organizationId, keyId, bucket) {
      await db
        .insertInto('usage_daily')
        .values({ day, organization_id: organizationId, key_id: keyId, bucket, count: 1 })
        .onConflict((oc) =>
          oc
            .columns(['day', 'key_id', 'bucket'])
            .doUpdateSet((eb) => ({ count: eb('usage_daily.count', '+', 1) })),
        )
        .execute();
    },

    async read(organizationId, from, to) {
      const rows = await db
        .selectFrom('usage_daily')
        .select(['day', 'key_id', 'bucket', 'count'])
        .where('organization_id', '=', organizationId)
        .$if(from !== undefined, (q) => q.where('day', '>=', from ?? ''))
        .$if(to !== undefined, (q) => q.where('day', '<=', to ?? ''))
        .orderBy('day')
        .orderBy('key_id')
        .orderBy('bucket')
        .execute();
      return rows.map((r) => ({ day: r.day, keyId: r.key_id, bucket: r.bucket, count: r.count }));
    },

    async prune(before) {
      const result = await db
        .deleteFrom('usage_daily')
        .where('day', '<', before)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },
  };
}
