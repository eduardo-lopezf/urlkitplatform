/**
 * Applies the migrations of the schema owned by the API (003, research R1). The list is static,
 * so the container needs no migrations folder on disk and the order is explicit.
 */
import type { Kysely } from 'kysely';
import { Migrator, type Migration } from 'kysely/migration';
import * as init from './migrations/0001-init.ts';

const MIGRATIONS: Record<string, Migration> = { '0001-init': init };

function migrator(db: Kysely<unknown>) {
  return new Migrator({ db, provider: { getMigrations: async () => MIGRATIONS } });
}

/** Brings the schema up to date. Throws if a migration fails; nothing half-applied stays. */
export async function migrateToLatest<T>(db: Kysely<T>): Promise<void> {
  const { error } = await migrator(db as Kysely<unknown>).migrateToLatest();
  if (error) throw error;
}

/** Reverts every migration, for tests and for the rollback plan of the architecture. */
export async function migrateDown<T>(db: Kysely<T>): Promise<void> {
  const m = migrator(db as Kysely<unknown>);
  for (;;) {
    const { error, results } = await m.migrateDown();
    if (error) throw error;
    if (!results?.length) return;
  }
}
