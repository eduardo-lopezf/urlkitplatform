import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { diffTool } from '@urlkit/core';
import { DiffRequest, ToolErrorSchema, UrlComparisonSchema } from '@urlkit/contracts';
import type { AppDeps } from '../../app.ts';
import { applyQuota, badRequest, identify, measure, quotaExceeded } from './shared.ts';

const route = createRoute({
  method: 'post',
  path: '/diff',
  request: { body: { required: true, content: { 'application/json': { schema: DiffRequest } } } },
  responses: {
    200: {
      description: 'Comparación',
      content: { 'application/json': { schema: UrlComparisonSchema } },
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

export function registerDiff(app: OpenAPIHono, deps: AppDeps): void {
  app.openapi(route, async (c) => {
    const input = c.req.valid('json');
    const subject = identify(c, deps);
    const quota = await applyQuota(c, deps, subject, 'local');
    if (!quota.allowed) return quotaExceeded(c, deps, 'diff', quota);
    const result = await diffTool.run(input, { catalog: deps.catalog });
    measure(deps, 'diff', result);
    return result.ok ? c.json(result.value, 200) : badRequest(c, result.error);
  });
}
