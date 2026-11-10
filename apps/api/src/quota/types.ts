/**
 * Quota subject: a discriminated type declared in full from the MVP (Principio IV, R20).
 * Only `anon-ip` is produced in the MVP; `api-key` and `organization` go through the same
 * limiter so that v3 changes which subject is resolved, not how quotas work.
 */
export type Subject =
  | { type: 'anon-ip'; hash: string }
  | { type: 'api-key'; keyId: string; organizationId: string }
  | { type: 'organization'; organizationId: string };

/** `local` = API endpoints of the tools that run in the browser; the web never calls them. */
export type QuotaBucket = 'inspect' | 'local' | 'metrics';

export type QuotaWindow = 'hour' | 'day';

export const WINDOW_SECONDS: Record<QuotaWindow, number> = { hour: 3600, day: 86_400 };

export interface Plan {
  id: string;
  limits: Record<QuotaBucket, Partial<Record<QuotaWindow, number>>>;
}

export interface QuotaDecision {
  allowed: boolean;
  /** Limit of the most restrictive window. */
  limit: number;
  remaining: number;
  /** Seconds until that window resets. */
  resetSeconds: number;
  /** Only when denied: seconds until the exhausted window resets. */
  retryAfterSeconds?: number;
}
