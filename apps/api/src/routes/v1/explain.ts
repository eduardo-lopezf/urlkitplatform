import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { explainTool } from '@urlkit/core';
import {
  ExplainRequest,
  ExplanationSchema,
  LangQuerySchema,
  ToolErrorSchema,
} from '@urlkit/contracts';
import type { AppDeps } from '../../app.ts';
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
  path: '/explain',
  request: {
    query: LangQuerySchema,
    body: { required: true, content: { 'application/json': { schema: ExplainRequest } } },
  },
  responses: {
    200: {
      description: 'Explicación',
      content: { 'application/json': { schema: ExplanationSchema } },
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

export function registerExplain(app: OpenAPIHono, deps: AppDeps): void {
  app.openapi(route, async (c) => {
    const input = c.req.valid('json');
    const { lang } = c.req.valid('query');
    const who = await identify(c, deps, 'explain', 'local');
    if (!('subject' in who)) return who;
    const { subject } = who;
    const quota = await applyQuota(c, deps, who, 'local');
    if (!quota.allowed) return quotaExceeded(c, deps, 'explain', quota, subject.type);
    const result = await explainTool.run(input, { catalog: deps.catalog });
    measure(deps, 'explain', result);
    return result.ok ? c.json(localize(result.value, lang), 200) : badRequest(c, result.error);
  });
}
