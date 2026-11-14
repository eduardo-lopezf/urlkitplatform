import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { analyzeHost, tlsTool } from '@urlkit/core';
import { LangQuerySchema, TlsAnalysisSchema, TlsRequest, ToolErrorSchema } from '@urlkit/contracts';
import type { AppDeps } from '../../app.ts';
import { withSpan } from '../../observability/tracing.ts';
import { localize } from '../../presentation/localize.ts';
import {
  AUTH_RESPONSES,
  applyQuota,
  badRequest,
  identify,
  measure,
  quotaExceeded,
} from './shared.ts';

const route = createRoute({
  method: 'post',
  path: '/tls',
  request: {
    query: LangQuerySchema,
    body: { required: true, content: { 'application/json': { schema: TlsRequest } } },
  },
  responses: {
    200: {
      description: 'Análisis TLS',
      content: { 'application/json': { schema: TlsAnalysisSchema } },
    },
    400: {
      description: 'Entrada inválida',
      content: { 'application/json': { schema: ToolErrorSchema } },
    },
    429: {
      description: 'Límite de uso alcanzado',
      content: { 'application/json': { schema: ToolErrorSchema } },
    },
    ...AUTH_RESPONSES,
  },
});

/** Registrable domain of the target, the most a trace may carry. */
const domainOf = (target: string) => {
  const host = analyzeHost(target);
  return host.ok ? (host.value.registrable ?? undefined) : undefined;
};

/** 002/T060: validate, identify, quota, invoke, measure, respond. No product rule here. */
export function registerTls(app: OpenAPIHono, deps: AppDeps): void {
  app.openapi(route, async (c) => {
    const input = c.req.valid('json');
    const { lang } = c.req.valid('query');
    const who = await identify(c, deps, 'tls', 'tls');
    if (!('subject' in who)) return who;
    const { subject } = who;
    const quota = await applyQuota(c, deps, who, 'tls');
    if (!quota.allowed) return quotaExceeded(c, deps, 'tls', quota, subject.type);
    const result = await withSpan(
      'tls',
      { 'urlkit.tool': 'tls', 'url.registrable_domain': domainOf(input.target) },
      async (span) => {
        const r = await tlsTool.run(input, { probeTls: deps.tlsProber(), catalog: deps.catalog });
        // Only the protocol version; never a certificate field (research R14).
        if (r.ok && r.value.protocol) span.set({ 'tls.protocol': r.value.protocol });
        return r;
      },
    );
    measure(deps, 'tls', result);
    return result.ok ? c.json(localize(result.value, lang), 200) : badRequest(c, result.error);
  });
}
