/**
 * Connection to the PostgreSQL owned by the API (003, research R1). Only this service touches
 * these tables (Principio IX): the admin CLI uses this same module.
 */
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.ts';

const DATE_OID = 1082;

export interface Db {
  kysely: Kysely<Database>;
  close(): Promise<void>;
}

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 2000,
    // DATE stays a `YYYY-MM-DD` string instead of a Date at local midnight.
    types: {
      getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
        oid === DATE_OID
          ? (value: string) => value
          : pg.types.getTypeParser(oid, format)) as typeof pg.types.getTypeParser,
    },
  });
  // An idle client that loses its connection must not crash the process; the next query fails
  // and the caller decides (503 auth.unavailable, research R8).
  pool.on('error', () => undefined);
  const kysely = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  return { kysely, close: () => kysely.destroy() };
}
