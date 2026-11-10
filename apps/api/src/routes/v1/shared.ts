/**
 * Building blocks for /v1 handlers. Each handler reads top to bottom as the six steps of
 * docs/arquitectura.md §4 (validate, identify, quota, invoke, measure, respond); these helpers
 * only serialise. No product rule lives here (Principio VIII).
 */
import type { Context } from 'hono';
import type { Result, ToolError, ToolId } from '@urlkit/core';
import type { AppDeps } from '../../app.ts';
import { rateLimitHeaders } from '../../quota/limiter.ts';
import { resolveSubject } from '../../quota/subject.ts';
import type { QuotaBucket, QuotaDecision, Subject } from '../../quota/types.ts';

export function identify(c: Context, deps: AppDeps): Subject {
  return resolveSubject(deps.clientIp(c), deps.secret, new Date(deps.now()));
}

export async function applyQuota(c: Context, deps: AppDeps, subject: Subject, bucket: QuotaBucket) {
  const decision = await deps.limiter.consume(subject, bucket);
  for (const [name, value] of Object.entries(rateLimitHeaders(decision))) c.header(name, value);
  return decision;
}

export function quotaExceeded(
  c: Context,
  deps: AppDeps,
  tool: ToolId | 'metrics',
  decision: QuotaDecision,
) {
  const retryAfterSeconds = decision.retryAfterSeconds ?? decision.resetSeconds;
  deps.metrics.toolRun(tool, 'quota-exceeded');
  deps.logger.info('quota.exceeded', { tool, subjectType: 'anon-ip' });
  c.header('Retry-After', String(retryAfterSeconds));
  return c.json(
    {
      code: 'quota.exceeded' as const,
      message: { code: 'quota.exceeded' as const },
      retryAfterSeconds,
    },
    429,
  );
}

export function measure(deps: AppDeps, tool: ToolId, result: Result<unknown>): void {
  deps.metrics.toolRun(tool, result.ok ? 'success' : 'error');
  if (!result.ok) deps.metrics.error(tool, result.error.code);
  deps.logger.info('tool.run', {
    tool,
    outcome: result.ok ? 'success' : 'error',
    ...(result.ok ? {} : { code: result.error.code }),
  });
}

/** Core errors are client errors: the input was invalid (FR-008). */
export function badRequest(c: Context, error: ToolError) {
  return c.json(error, 400);
}
