import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { cleanTool } from '@urlkit/core';
import { CleanRequest, CleanResultSchema, ToolErrorSchema } from '@urlkit/contracts';
import type { AppDeps } from '../../app.ts';
import { applyQuota, badRequest, identify, measure, quotaExceeded } from './shared.ts';

const route = createRoute({
  method: 'post',
  path: '/clean',
  request: { body: { required: true, content: { 'application/json': { schema: CleanRequest } } } },
  responses: {
    200: {
      description: 'Resultado de limpieza',
      content: { 'application/json': { schema: CleanResultSchema } },
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

export function registerClean(app: OpenAPIHono, deps: AppDeps): void {
  app.openapi(route, async (c) => {
    const input = c.req.valid('json'); // 1. validate (route schema)
    const subject = identify(c, deps); // 2. identity
    const quota = await applyQuota(c, deps, subject, 'local'); // 3. quota
    if (!quota.allowed) return quotaExceeded(c, deps, 'clean', quota);
    const result = await cleanTool.run(input, { catalog: deps.catalog }); // 4. invoke (catalog injected)
    measure(deps, 'clean', result); // 5. measure
    return result.ok ? c.json(result.value, 200) : badRequest(c, result.error); // 6. respond
  });
}
