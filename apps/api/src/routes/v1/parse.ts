import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { parseTool } from '@urlkit/core';
import { ParseRequest, ParsedUrlSchema, ToolErrorSchema } from '@urlkit/contracts';
import type { AppDeps } from '../../app.ts';
import { applyQuota, badRequest, identify, measure, quotaExceeded } from './shared.ts';

const route = createRoute({
  method: 'post',
  path: '/parse',
  request: { body: { required: true, content: { 'application/json': { schema: ParseRequest } } } },
  responses: {
    200: {
      description: 'URL analizada',
      content: { 'application/json': { schema: ParsedUrlSchema } },
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

export function registerParse(app: OpenAPIHono, deps: AppDeps): void {
  app.openapi(route, async (c) => {
    const input = c.req.valid('json');
    const subject = identify(c, deps);
    const quota = await applyQuota(c, deps, subject, 'local');
    if (!quota.allowed) return quotaExceeded(c, deps, 'parse', quota);
    const result = await parseTool.run(input, {});
    measure(deps, 'parse', result);
    return result.ok ? c.json(result.value, 200) : badRequest(c, result.error);
  });
}
