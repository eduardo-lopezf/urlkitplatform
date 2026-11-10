import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { inspectTool, parseUrl } from '@urlkit/core';
import { InspectRequest, RedirectChainSchema, ToolErrorSchema } from '@urlkit/contracts';
import type { AppDeps } from '../../app.ts';
import { withSpan } from '../../observability/tracing.ts';
import { applyQuota, badRequest, identify, measure, quotaExceeded } from './shared.ts';

const route = createRoute({
  method: 'post',
  path: '/inspect',
  request: {
    body: { required: true, content: { 'application/json': { schema: InspectRequest } } },
  },
  responses: {
    200: {
      description: 'Cadena de redirecciones',
      content: { 'application/json': { schema: RedirectChainSchema } },
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

export function registerInspect(app: OpenAPIHono, deps: AppDeps): void {
  app.openapi(route, async (c) => {
    const input = c.req.valid('json');
    const subject = identify(c, deps);
    const quota = await applyQuota(c, deps, subject, 'inspect');
    if (!quota.allowed) return quotaExceeded(c, deps, 'inspect', quota);
    const started = deps.now();
    const result = await withSpan(
      'inspect',
      { 'urlkit.tool': 'inspect', 'url.registrable_domain': domainOf(input.url) },
      async (span) => {
        const r = await inspectTool.run(input, { fetchHop: deps.inspectFetcher() });
        if (r.ok)
          span.set({
            'urlkit.stop_reason': r.value.stopReason,
            'urlkit.hops': r.value.hops.length,
          });
        return r;
      },
    );
    measure(deps, 'inspect', result);
    deps.metrics.inspectDuration((deps.now() - started) / 1000);
    return result.ok ? c.json(result.value, 200) : badRequest(c, result.error);
  });
}
