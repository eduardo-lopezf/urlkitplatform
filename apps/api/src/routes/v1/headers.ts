import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { headersTool, parseUrl } from '@urlkit/core';
import {
  HeadersAnalysisSchema,
  HeadersRequest,
  LangQuerySchema,
  ToolErrorSchema,
} from '@urlkit/contracts';
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
  path: '/headers',
  request: {
    query: LangQuerySchema,
    body: { required: true, content: { 'application/json': { schema: HeadersRequest } } },
  },
  responses: {
    200: {
      description: 'Análisis de cabeceras',
      content: { 'application/json': { schema: HeadersAnalysisSchema } },
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

/** Registrable domain of the input, the most a trace may carry (never path, query or fragment). */
const domainOf = (url: string) => {
  const parsed = parseUrl(url);
  return parsed.ok ? (parsed.value.registrableDomain ?? undefined) : undefined;
};

/** 002/T033: validate, identify, quota, invoke, measure, respond. No product rule here. */
export function registerHeaders(app: OpenAPIHono, deps: AppDeps): void {
  app.openapi(route, async (c) => {
    const input = c.req.valid('json');
    const { lang } = c.req.valid('query');
    const who = await identify(c, deps, 'headers', 'headers');
    if (!('subject' in who)) return who;
    const { subject } = who;
    const quota = await applyQuota(c, deps, who, 'headers');
    if (!quota.allowed) return quotaExceeded(c, deps, 'headers', quota, subject.type);
    const result = await withSpan(
      'headers',
      { 'urlkit.tool': 'headers', 'url.registrable_domain': domainOf(input.url) },
      async () =>
        headersTool.run(input, { fetchChain: deps.chainFetcher(), catalog: deps.catalog }),
    );
    measure(deps, 'headers', result);
    return result.ok ? c.json(localize(result.value, lang), 200) : badRequest(c, result.error);
  });
}
