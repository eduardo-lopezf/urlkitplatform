import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { analyzeHost, dnsTool } from '@urlkit/core';
import { DnsLookupSchema, DnsRequest, LangQuerySchema, ToolErrorSchema } from '@urlkit/contracts';
import type { AppDeps } from '../../app.ts';
import { withSpan } from '../../observability/tracing.ts';
import { localize } from '../../presentation/localize.ts';
import { applyQuota, badRequest, identify, measure, quotaExceeded } from './shared.ts';

const route = createRoute({
  method: 'post',
  path: '/dns',
  request: {
    query: LangQuerySchema,
    body: { required: true, content: { 'application/json': { schema: DnsRequest } } },
  },
  responses: {
    200: {
      description: 'Consulta DNS',
      content: { 'application/json': { schema: DnsLookupSchema } },
    },
    400: {
      description: 'Entrada inválida',
      content: { 'application/json': { schema: ToolErrorSchema } },
    },
    429: {
      description: 'Límite de uso alcanzado',
      content: { 'application/json': { schema: ToolErrorSchema } },
    },
    503: {
      description: 'Ningún resolutor respondió',
      content: { 'application/json': { schema: ToolErrorSchema } },
    },
  },
});

/** Registrable domain of the target, the most a trace may carry. */
const domainOf = (target: string) => {
  const host = analyzeHost(target);
  return host.ok ? (host.value.registrable ?? undefined) : undefined;
};

/**
 * 002/T072: validate, identify, quota, invoke, measure, respond. The one translation of a core
 * error to HTTP is `dns.unavailable` → 503, whose use is given back: the service failed, not the
 * request (contract, research R10).
 */
export function registerDns(app: OpenAPIHono, deps: AppDeps): void {
  app.openapi(route, async (c) => {
    const input = c.req.valid('json');
    const { lang } = c.req.valid('query');
    const subject = identify(c, deps);
    const quota = await applyQuota(c, deps, subject, 'dns');
    if (!quota.allowed) return quotaExceeded(c, deps, 'dns', quota);
    const result = await withSpan(
      'dns',
      { 'urlkit.tool': 'dns', 'url.registrable_domain': domainOf(input.target) },
      async () => dnsTool.run(input, { queryDns: deps.dnsQuerier() }),
    );
    measure(deps, 'dns', result);
    if (result.ok) return c.json(localize(result.value, lang), 200);
    if (result.error.code === 'dns.unavailable') {
      await deps.limiter.refund(subject, 'dns');
      return c.json(localize(result.error, lang), 503);
    }
    return badRequest(c, result.error);
  });
}
