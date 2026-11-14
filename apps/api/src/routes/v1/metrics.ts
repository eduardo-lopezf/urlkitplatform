import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { MetricsEvent, ToolErrorSchema } from '@urlkit/contracts';
import type { AppDeps } from '../../app.ts';
import { applyQuota, identifyAnonymous, quotaExceeded } from './shared.ts';

const route = createRoute({
  method: 'post',
  path: '/metrics/events',
  request: { body: { required: true, content: { 'application/json': { schema: MetricsEvent } } } },
  responses: {
    204: { description: 'Registrado' },
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

export function registerMetrics(app: OpenAPIHono, deps: AppDeps): void {
  app.openapi(route, async (c) => {
    const event = c.req.valid('json');
    const subject = identifyAnonymous(c, deps); // keys are ignored here
    const quota = await applyQuota(c, deps, { subject }, 'metrics');
    if (!quota.allowed) return quotaExceeded(c, deps, 'metrics', quota);
    deps.metrics.toolRun(event.tool, event.outcome);
    return c.body(null, 204);
  });
}
