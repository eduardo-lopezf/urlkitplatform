import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { parseUrl, securityTool } from '@urlkit/core';
import {
  LangQuerySchema,
  SecurityRequest,
  SecurityReviewSchema,
  ToolErrorSchema,
} from '@urlkit/contracts';
import type { AppDeps } from '../../app.ts';
import { withSpan } from '../../observability/tracing.ts';
import { localize } from '../../presentation/localize.ts';
import { applyQuota, badRequest, identify, measure, quotaExceeded } from './shared.ts';

const route = createRoute({
  method: 'post',
  path: '/security',
  request: {
    query: LangQuerySchema,
    body: { required: true, content: { 'application/json': { schema: SecurityRequest } } },
  },
  responses: {
    200: {
      description: 'Revisión de seguridad, posiblemente parcial',
      content: { 'application/json': { schema: SecurityReviewSchema } },
    },
    400: {
      description: 'Entrada inválida',
      content: { 'application/json': { schema: ToolErrorSchema } },
    },
    429: {
      description: 'Límite de uso alcanzado',
      content: { 'application/json': { schema: ToolErrorSchema } },
    },
  },
});

/** Registrable domain of the input, the most a trace may carry (never path, query or fragment). */
const domainOf = (url: string) => {
  const parsed = parseUrl(url);
  return parsed.ok ? (parsed.value.registrableDomain ?? undefined) : undefined;
};

/**
 * 002/T086: validate, identify, quota, invoke, measure, respond. One analysis is one use of the
 * `security` quota: the probes are called through its own adapters, never through other routes.
 */
export function registerSecurity(app: OpenAPIHono, deps: AppDeps): void {
  app.openapi(route, async (c) => {
    const input = c.req.valid('json');
    const { lang } = c.req.valid('query');
    const subject = identify(c, deps);
    const quota = await applyQuota(c, deps, subject, 'security');
    if (!quota.allowed) return quotaExceeded(c, deps, 'security', quota);
    const result = await withSpan(
      'security',
      { 'urlkit.tool': 'security', 'url.registrable_domain': domainOf(input.url) },
      async () => securityTool.run(input, { ...deps.securityAdapters(), catalog: deps.catalog }),
    );
    measure(deps, 'security', result);
    return result.ok ? c.json(localize(result.value, lang), 200) : badRequest(c, result.error);
  });
}
