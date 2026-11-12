import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { metadataTool, parseUrl } from '@urlkit/core';
import { parseHtml } from '@urlkit/core/html';
import {
  LangQuerySchema,
  MetadataRequest,
  PageMetadataSchema,
  ToolErrorSchema,
} from '@urlkit/contracts';
import type { AppDeps } from '../../app.ts';
import { withSpan } from '../../observability/tracing.ts';
import { localize } from '../../presentation/localize.ts';
import { applyQuota, badRequest, identify, measure, quotaExceeded } from './shared.ts';

const route = createRoute({
  method: 'post',
  path: '/metadata',
  request: {
    query: LangQuerySchema,
    body: { required: true, content: { 'application/json': { schema: MetadataRequest } } },
  },
  responses: {
    200: {
      description: 'Metadatos de la página',
      content: { 'application/json': { schema: PageMetadataSchema } },
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

/** 002/T046: validate, identify, quota, invoke, measure, respond. No product rule here. */
export function registerMetadata(app: OpenAPIHono, deps: AppDeps): void {
  app.openapi(route, async (c) => {
    const input = c.req.valid('json');
    const { lang } = c.req.valid('query');
    const subject = identify(c, deps);
    const quota = await applyQuota(c, deps, subject, 'metadata');
    if (!quota.allowed) return quotaExceeded(c, deps, 'metadata', quota);
    const result = await withSpan(
      'metadata',
      { 'urlkit.tool': 'metadata', 'url.registrable_domain': domainOf(input.url) },
      async () =>
        metadataTool.run(input, {
          fetchChain: deps.chainFetcher(),
          parseHtml,
          catalog: deps.catalog,
        }),
    );
    measure(deps, 'metadata', result);
    return result.ok ? c.json(localize(result.value, lang), 200) : badRequest(c, result.error);
  });
}
