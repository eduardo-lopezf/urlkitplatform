/**
 * PostgreSQL for the integration tests (003). Runs only with DATABASE_URL (`docker compose up -d
 * postgres`, or the PostgreSQL service in CI). Each suite gets a database of its own, created
 * empty and dropped at the end, so suites never see each other's rows.
 */
import { randomBytes } from 'node:crypto';
import pg from 'pg';

export const DATABASE_URL = process.env.DATABASE_URL;

export interface TestDatabase {
  url: string;
  drop(): Promise<void>;
}

export async function freshDatabase(): Promise<TestDatabase> {
  const name = `urlkit_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = new URL(DATABASE_URL ?? '');
  url.pathname = `/${name}`;
  return {
    url: url.href,
    async drop() {
      const client = new pg.Client({ connectionString: DATABASE_URL });
      await client.connect();
      await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await client.end();
    },
  };
}
