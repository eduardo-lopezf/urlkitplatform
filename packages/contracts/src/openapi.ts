/**
 * Builds the published OpenAPI document of /v1 from the Zod schemas (Principio IX). The same
 * schemas validate requests in the API and type the browser's inspect client.
 */
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { CleanRequest, CleanResultSchema } from './v1/clean.ts';
import { LangQuerySchema, ToolErrorSchema, z } from './v1/common.ts';
import { DiffRequest, UrlComparisonSchema } from './v1/diff.ts';
import { ExplainRequest, ExplanationSchema } from './v1/explain.ts';
import { InspectRequest, RedirectChainSchema } from './v1/inspect.ts';
import { MetricsEvent } from './v1/metrics.ts';
import { ParseRequest, ParsedUrlSchema } from './v1/parse.ts';

const RATE_LIMIT_HEADERS = {
  'RateLimit-Limit': { schema: { type: 'string' as const } },
  'RateLimit-Remaining': { schema: { type: 'string' as const } },
  'RateLimit-Reset': { schema: { type: 'string' as const } },
};

const json = (schema: z.ZodType) => ({ 'application/json': { schema } });

const badRequest = { description: 'Entrada inválida', content: json(ToolErrorSchema) };
const quotaExceeded = {
  description: 'Límite de uso alcanzado',
  headers: { 'Retry-After': { schema: { type: 'integer' as const } }, ...RATE_LIMIT_HEADERS },
  content: json(ToolErrorSchema),
};

function tool(
  registry: OpenAPIRegistry,
  path: string,
  operationId: string,
  summary: string,
  body: z.ZodType,
  result: z.ZodType,
  description: string,
  extra: { query?: z.ZodObject; okDescription?: string } = {},
) {
  registry.registerPath({
    method: 'post',
    path,
    tags: ['tools'],
    operationId,
    summary,
    ...(extra.okDescription === undefined ? {} : { description: extra.okDescription }),
    request: {
      body: { required: true, content: json(body) },
      ...(extra.query ? { query: extra.query } : {}),
    },
    responses: {
      200: { description, headers: RATE_LIMIT_HEADERS, content: json(result) },
      400: badRequest,
      429: quotaExceeded,
    },
  });
}

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.registerComponent('securitySchemes', 'apiKey', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'urlkit-api-key',
    description:
      'Clave de API en `Authorization: Bearer <clave>`. Declarada desde la v1 y opcional: sin uso en el MVP. Cuando se active, la clave determinará el sujeto de la cuota (`api-key` u `organization`) y las cabeceras `RateLimit-*` serán las mismas que para el visitante anónimo.',
  });
  registry.registerComponent('responses', 'Unauthorized', {
    description:
      'Clave de API ausente o inválida. Reservada: no se emite en el MVP, donde la clave es opcional.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ToolError' } } },
  });

  tool(
    registry,
    '/clean',
    'cleanUrl',
    'Smart Cleaner',
    CleanRequest,
    CleanResultSchema,
    'Resultado de limpieza',
  );
  tool(
    registry,
    '/parse',
    'parseUrl',
    'URL Parser',
    ParseRequest,
    ParsedUrlSchema,
    'URL analizada',
  );
  tool(registry, '/diff', 'diffUrls', 'URL Diff', DiffRequest, UrlComparisonSchema, 'Comparación');
  tool(
    registry,
    '/explain',
    'explainUrl',
    'Explain URL',
    ExplainRequest,
    ExplanationSchema,
    'Explicación',
    {
      query: LangQuerySchema,
    },
  );
  tool(
    registry,
    '/inspect',
    'inspectRedirects',
    'Redirect Inspector',
    InspectRequest,
    RedirectChainSchema,
    'Cadena de redirecciones. Bloqueos, bucles, tiempos de espera y errores TLS se informan aquí con stopReason, no como error HTTP.',
    {
      okDescription:
        'Sigue la cadena de redirecciones desde el servidor. Límite sin cuenta: 10 por hora y 50 por día por visitante. Destinos internos o privados se bloquean.',
    },
  );

  registry.registerPath({
    method: 'post',
    path: '/metrics/events',
    tags: ['metrics'],
    operationId: 'recordEvent',
    summary: 'Evento de uso anónimo',
    description:
      'Sin cookies ni identificadores. Solo incrementa contadores agregados. Límite de 300 eventos por hora por visitante; la web ignora en silencio las respuestas 429.',
    request: { body: { required: true, content: json(MetricsEvent) } },
    responses: { 204: { description: 'Registrado' }, 400: badRequest, 429: quotaExceeded },
  });

  registry.registerPath({
    method: 'get',
    path: '/openapi.json',
    operationId: 'getOpenApi',
    summary: 'Este contrato',
    responses: { 200: { description: 'Documento OpenAPI' } },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'URLkit API',
      version: '1.0.0',
      description:
        'API v1 del MVP de URLkit. Anónima y gratuita con limitación de tasa por IP seudonimizada. Las URLs enviadas no se almacenan ni se registran. El esquema `apiKey` está declarado desde esta versión y es opcional.',
    },
    servers: [
      { url: 'https://api.urlkit.example/v1', description: 'Producción (dominio provisional)' },
    ],
    // `{}` keeps every endpoint usable without credentials; activating keys in v3 is additive.
    security: [{}, { apiKey: [] }],
    tags: [{ name: 'tools' }, { name: 'metrics' }],
  });
}
