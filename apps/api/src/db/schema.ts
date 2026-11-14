/**
 * Kysely view of the schema owned by the API (003, data-model.md). It is written next to the
 * migrations, in the same service; tests/integration/db.test.ts checks that both agree.
 * Nothing here can hold a URL, a query, an IP, a secret or personal data (FR-040, FR-041).
 */
import type { ColumnType, Generated } from 'kysely';

type CreatedAt = ColumnType<Date, Date | undefined, never>;

export interface OrganizationsTable {
  id: Generated<string>;
  name: string;
  note: string | null;
  plan_id: string;
  status: Generated<'active' | 'inactive'>;
  created_at: CreatedAt;
  deactivated_at: Date | null;
}

export interface ApiKeysTable {
  /** The short, public id of the key (research R2). */
  id: string;
  organization_id: string;
  /** SHA-256 of the secret, 32 bytes. Never the secret (FR-003). */
  secret_hash: Buffer;
  created_at: CreatedAt;
  revoked_at: Date | null;
}

export interface UsageDailyTable {
  /** UTC day, `YYYY-MM-DD`. Read as text so no time zone ever shifts it. */
  day: string;
  organization_id: string;
  key_id: string;
  bucket: string;
  count: number;
}

export interface Database {
  organizations: OrganizationsTable;
  api_keys: ApiKeysTable;
  usage_daily: UsageDailyTable;
}
