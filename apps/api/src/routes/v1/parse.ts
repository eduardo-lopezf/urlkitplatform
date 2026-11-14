import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { parseTool } from '@urlkit/core';
import { ParseRequest, ParsedUrlSchema, ToolErrorSchema } from '@urlkit/contracts';
import type { AppDeps } from '../../app.ts';
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
    ...AUTH_RESPONSES,
  },
});

export function registerParse(app: OpenAPIHono, deps: AppDeps): void {
  app.openapi(route, async (c) => {
    const input = c.req.valid('json');
    const who = await identify(c, deps, 'parse', 'local');
    if (!('subject' in who)) return who;
    const { subject } = who;
    const quota = await applyQuota(c, deps, who, 'local');
    if (!quota.allowed) return quotaExceeded(c, deps, 'parse', quota, subject.type);
    const result = await parseTool.run(input, {});
    measure(deps, 'parse', result);
    return result.ok ? c.json(result.value, 200) : badRequest(c, result.error);
  });
}
