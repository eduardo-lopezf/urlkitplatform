/**
 * First schema of the product (003, data-model.md): organizations, API key hashes and daily
 * usage counts. `down` drops everything, so the migration can be reverted.
 */
import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('organizations')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text', (c) => c.notNull().check(sql`char_length(name) BETWEEN 1 AND 100`))
    .addColumn('note', 'text', (c) => c.check(sql`char_length(note) <= 500`))
    .addColumn('plan_id', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) =>
      c
        .notNull()
        .defaultTo('active')
        .check(sql`status IN ('active', 'inactive')`),
    )
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('deactivated_at', 'timestamptz')
    .addCheckConstraint(
      'organizations_deactivated_at',
      sql`(status = 'inactive') = (deactivated_at IS NOT NULL)`,
    )
    .execute();
  await sql`CREATE UNIQUE INDEX organizations_name_lower ON organizations (lower(name))`.execute(
    db,
  );

  await db.schema
    .createTable('api_keys')
    .addColumn('id', 'text', (c) => c.primaryKey().check(sql`id ~ '^[0-9a-hjkmnp-tv-z]{12}$'`))
    .addColumn('organization_id', 'uuid', (c) => c.notNull().references('organizations.id'))
    .addColumn('secret_hash', 'bytea', (c) =>
      c.notNull().check(sql`octet_length(secret_hash) = 32`),
    )
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('revoked_at', 'timestamptz')
    .execute();
  await db.schema
    .createIndex('api_keys_organization')
    .on('api_keys')
    .column('organization_id')
    .execute();

  await db.schema
    .createTable('usage_daily')
    .addColumn('day', 'date', (c) => c.notNull())
    .addColumn('organization_id', 'uuid', (c) => c.notNull().references('organizations.id'))
    .addColumn('key_id', 'text', (c) => c.notNull().references('api_keys.id'))
    .addColumn('bucket', 'text', (c) => c.notNull())
    .addColumn('count', 'integer', (c) => c.notNull().check(sql`count >= 1`))
    .addPrimaryKeyConstraint('usage_daily_pkey', ['day', 'key_id', 'bucket'])
    .execute();
  await db.schema
    .createIndex('usage_daily_organization_day')
    .on('usage_daily')
    .columns(['organization_id', 'day'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('usage_daily').execute();
  await db.schema.dropTable('api_keys').execute();
  await db.schema.dropTable('organizations').execute();
}
