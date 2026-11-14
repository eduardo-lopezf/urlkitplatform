/**
 * Fixed-window limiter (research R7). Each bucket has one or more windows (hour, day); a request
 * is allowed while every window is under its limit. Keys:
 *   quota:{bucket}:{window}:{windowStart}:{subjectType}:{subjectId}
 */
import type { Logger } from '../privacy/logger.ts';
import { planFor } from './plans.ts';
import type { QuotaStore } from './store.ts';
import { subjectKey } from './subject.ts';
import {
  WINDOW_SECONDS,
  type QuotaBucket,
  type QuotaDecision,
  type QuotaWindow,
  type Subject,
} from './types.ts';

export interface Limiter {
  /** `planId` is the organization's plan for `organization` subjects (003, research R5). */
  consume(subject: Subject, bucket: QuotaBucket, planId?: string): Promise<QuotaDecision>;
  /** Gives back one use that the service could not provide (DNS `503`, 002/T072). */
  refund(subject: Subject, bucket: QuotaBucket, planId?: string): Promise<void>;
}

export function createLimiter({
  store,
  now = Date.now,
  logger,
}: {
  store: QuotaStore;
  now?: () => number;
  logger?: Logger;
}): Limiter {
  const keys = (subject: Subject, bucket: QuotaBucket, planId?: string) => {
    const nowSeconds = now() / 1000;
    const limits = planFor(subject, planId, logger).limits[bucket];
    return (Object.keys(limits) as QuotaWindow[]).map((window) => {
      const size = WINDOW_SECONDS[window];
      const start = Math.floor(nowSeconds / size) * size;
      return `quota:${bucket}:${window}:${start}:${subjectKey(subject)}`;
    });
  };
  return {
    async refund(subject, bucket, planId) {
      for (const key of keys(subject, bucket, planId)) await store.decrement?.(key);
    },
    async consume(subject, bucket, planId) {
      const nowSeconds = now() / 1000;
      const windows = Object.entries(planFor(subject, planId, logger).limits[bucket]) as Array<
        [QuotaWindow, number]
      >;
      const states = [];
      for (const [window, limit] of windows) {
        const size = WINDOW_SECONDS[window];
        const start = Math.floor(nowSeconds / size) * size;
        const resetSeconds = start + size - nowSeconds;
        const key = `quota:${bucket}:${window}:${start}:${subjectKey(subject)}`;
        const count = await store.increment(key, resetSeconds);
        states.push({ limit, count, resetSeconds: Math.ceil(resetSeconds) });
      }
      const exhausted = states.filter((s) => s.count > s.limit);
      const tightest = [...states].sort(
        (a, b) => a.limit - a.count - (b.limit - b.count) || b.resetSeconds - a.resetSeconds,
      )[0] ?? { limit: 0, count: 0, resetSeconds: 0 };
      const blocking = [...exhausted].sort((a, b) => b.resetSeconds - a.resetSeconds)[0];
      const shown = blocking ?? tightest;
      return {
        allowed: exhausted.length === 0,
        limit: shown.limit,
        remaining: Math.max(0, shown.limit - shown.count),
        resetSeconds: shown.resetSeconds,
        ...(blocking ? { retryAfterSeconds: blocking.resetSeconds } : {}),
      };
    },
  };
}

/** Same headers for every subject type (Principio IV). */
export function rateLimitHeaders(decision: QuotaDecision): Record<string, string> {
  return {
    'RateLimit-Limit': String(decision.limit),
    'RateLimit-Remaining': String(decision.remaining),
    'RateLimit-Reset': String(decision.resetSeconds),
  };
}
