/**
 * Building blocks for /v1 handlers. Each handler reads top to bottom as the six steps of
 * docs/arquitectura.md §4 (validate, identify, quota, invoke, measure, respond); these helpers
 * only serialise. No product rule lives here (Principio VIII).
 */
import type { Context } from 'hono';
import { ToolErrorSchema } from '@urlkit/contracts';
import type { Result, ToolError, ToolId } from '@urlkit/core';
import type { AppDeps } from '../../app.ts';
import { rateLimitHeaders } from '../../quota/limiter.ts';
import { resolveSubject } from '../../quota/subject.ts';
import type { QuotaBucket, QuotaDecision, Subject } from '../../quota/types.ts';

/** Who is asking (003): the organization of a valid key, or the anonymous visitor. */
export interface Identity {
  subject: Subject;
  /** Only with a key: the key that made the request, for usage counts (research R6). */
  keyId?: string;
  /** Only with a key: the organization's plan (research R4). */
  planId?: string;
}

/** The pseudonymised visitor, for requests that never use keys (metrics). */
export function identifyAnonymous(c: Context, deps: AppDeps): Subject {
  return resolveSubject(deps.clientIp(c), deps.secret, new Date(deps.now()));
}

const authError = <C extends 'auth.invalid' | 'auth.unavailable'>(code: C) => ({
  code,
  message: { code },
});

/** The two answers `identify()` may give instead of an identity, declared on every tool route. */
export const AUTH_RESPONSES = {
  401: {
    description: 'Clave no válida (auth.invalid)',
    content: { 'application/json': { schema: ToolErrorSchema } },
  },
  503: {
    description: 'Clave no verificable ahora (auth.unavailable)',
    content: { 'application/json': { schema: ToolErrorSchema } },
  },
};

/**
 * Step 2 of every tool route (003, contracts/api-auth.md). Without `Authorization` the request is
 * anonymous, exactly as before. A valid key identifies its organization. Anything else is a
 * `Response` the route returns as is: 401 `auth.invalid` after charging one anonymous use of the
 * route's bucket (FR-027), or 503 `auth.unavailable` when the key cannot be checked (FR-043).
 */
export async function identify(c: Context, deps: AppDeps, tool: ToolId, bucket: QuotaBucket) {
  const anonymous = identifyAnonymous(c, deps);
  const authorization = c.req.header('authorization');
  if (authorization === undefined) return { subject: anonymous } satisfies Identity;
  const verification = await deps.keyVerifier.verify(authorization);
  if (verification.kind === 'valid')
    return {
      subject: { type: 'organization', organizationId: verification.organizationId },
      keyId: verification.keyId,
      planId: verification.planId,
    } satisfies Identity;
  if (verification.kind === 'unavailable') {
    deps.logger.warn('auth.unavailable', { tool });
    c.header('Retry-After', '30');
    return c.json(authError('auth.unavailable'), 503);
  }
  const quota = await applyQuota(c, deps, { subject: anonymous }, bucket);
  if (!quota.allowed) return quotaExceeded(c, deps, tool, quota);
  deps.logger.info('auth.invalid', { tool });
  c.header('WWW-Authenticate', 'Bearer');
  return c.json(authError('auth.invalid'), 401);
}

/**
 * Step 3: the quota of whoever is asking, with the plan of their organization (003, research R5).
 * A request allowed with a key is counted for the operator's usage view (research R6).
 */
export async function applyQuota(c: Context, deps: AppDeps, who: Identity, bucket: QuotaBucket) {
  const decision = await deps.limiter.consume(who.subject, bucket, who.planId);
  if (decision.allowed) deps.usageRecorder.record(who, bucket);
  for (const [name, value] of Object.entries(rateLimitHeaders(decision))) c.header(name, value);
  return decision;
}

export function quotaExceeded(
  c: Context,
  deps: AppDeps,
  tool: ToolId | 'metrics',
  decision: QuotaDecision,
  subjectType: Subject['type'] = 'anon-ip',
) {
  const retryAfterSeconds = decision.retryAfterSeconds ?? decision.resetSeconds;
  deps.metrics.toolRun(tool, 'quota-exceeded');
  deps.logger.info('quota.exceeded', { tool, subjectType });
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
