/**
 * Usage counts (003, research R6, FR-030). Each request served with a key adds one to
 * `(day, key, bucket)`. The write is not awaited: it never delays or fails the response, and a
 * failure is logged without any request data. Only numbers are stored (FR-032).
 */
import type { Logger } from '../privacy/logger.ts';
import type { QuotaBucket, Subject } from '../quota/types.ts';

export interface UsageRow {
  day: string;
  keyId: string;
  bucket: string;
  count: number;
}

export interface UsageStore {
  /** Adds one to the count of `(day, key, bucket)`. `day` is `YYYY-MM-DD`, UTC. */
  add(day: string, organizationId: string, keyId: string, bucket: QuotaBucket): Promise<void>;
  /** Counts of an organization, by day, key and bucket, optionally between two days. */
  read(organizationId: string, from?: string, to?: string): Promise<UsageRow[]>;
  /** Deletes the counts of days before `before`; returns how many rows went. */
  prune(before: string): Promise<number>;
}

export interface UsageRecorder {
  record(identity: { subject: Subject; keyId?: string }, bucket: QuotaBucket): void;
}

/** Without keys there is nothing to count. */
export const noUsageRecorder: UsageRecorder = { record: () => undefined };

export function createUsageRecorder({
  store,
  logger,
  now = Date.now,
}: {
  store: UsageStore;
  logger: Logger;
  now?: () => number;
}): UsageRecorder {
  return {
    record({ subject, keyId }, bucket) {
      if (subject.type !== 'organization' || keyId === undefined) return;
      const day = new Date(now()).toISOString().slice(0, 10);
      store
        .add(day, subject.organizationId, keyId, bucket)
        .catch(() => logger.warn('usage.write-failed', { code: 'usage.write-failed' }));
    },
  };
}
