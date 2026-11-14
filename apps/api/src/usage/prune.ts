/**
 * Retention of usage counts (003, FR-033): 13 months, then they are deleted on their own. The API
 * runs it at start-up and once a day; deleting is idempotent, so instances need no coordination.
 */
import type { UsageStore } from './record.ts';

/** First day that is kept: the same day, 13 months earlier (UTC). */
export function usageCutoff(now: number): string {
  const date = new Date(now);
  date.setUTCMonth(date.getUTCMonth() - 13);
  return date.toISOString().slice(0, 10);
}

export function pruneUsage(store: UsageStore, now: number = Date.now()): Promise<number> {
  return store.prune(usageCutoff(now));
}
