/**
 * Builds the published OpenAPI document of /v1 from the Zod schemas (Principio IX). The same
 * schemas validate requests in the API and type the browser's inspect client.
 */
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { CleanRequest, CleanResultSchema } from './v1/clean.ts';
import { LangQuerySchema, ToolErrorSchema, z } from './v1/common.ts';
import { DiffRequest, UrlComparisonSchema } from './v1/diff.ts';
import { ExplainRequest, ExplanationSchema } from './v1/explain.ts';
import { HeadersAnalysisSchema, HeadersRequest } from './v1/headers.ts';
import { MetadataRequest, PageMetadataSchema } from './v1/metadata.ts';
import { TlsAnalysisSchema, TlsRequest } from './v1/tls.ts';
import { DnsLookupSchema, DnsRequest } from './v1/dns.ts';
import { SecurityRequest, SecurityReviewSchema } from './v1/security.ts';
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
const unauthorized = {
  description:
    'Cabecera `Authorization` presente pero no válida: vacía, con otro esquema, mal formada, inexistente, revocada o de una organización desactivada (auth.invalid). El cuerpo es el mismo en todos los casos. Cada respuesta 401 consume un uso de la cuota anónima de quien la envía.',
  headers: { 'WWW-Authenticate': { schema: { type: 'string' as const } } },
  content: json(ToolErrorSchema),
};
const authUnavailable =
  'No se pudo comprobar la clave porque su almacenamiento no responde (auth.unavailable). Reintenta pasados los segundos de Retry-After. Las peticiones sin clave no se ven afectadas.';
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
  extra: { query?: z.ZodObject; okDescription?: string; unavailable?: string } = {},
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
      401: unauthorized,
      429: quotaExceeded,
      503: {
        description:
          extra.unavailable === undefined
            ? authUnavailable
            : `${extra.unavailable} ${authUnavailable}`,
        headers: { 'Retry-After': { schema: { type: 'integer' as const } } },
        content: json(ToolErrorSchema),
      },
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
      'Clave de API de una organización en `Authorization: Bearer uk_<id>_<secreto>`. Opcional: sin cabecera, la petición es anónima como siempre. Con una clave válida, la cuota es la del plan de la organización, compartida por todas sus claves, con las mismas cabeceras `RateLimit-*`. Las claves son para integraciones de servidor a servidor: CORS no permite enviarlas desde otros orígenes.',
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

  tool(
    registry,
    '/headers',
    'analyzeHeaders',
    'HTTP Headers',
    HeadersRequest,
    HeadersAnalysisSchema,
    'Análisis de cabeceras. Bloqueos, tiempos de espera y errores TLS se informan aquí con stopReason y error, no como error HTTP.',
    {
      query: LangQuerySchema,
      okDescription:
        'Sigue las redirecciones con las reglas de Redirect Inspector y devuelve el estado y las cabeceras de la respuesta final, en el orden recibido, con la evaluación de las cabeceras de seguridad. Los valores de Set-Cookie nunca se devuelven. Límite sin cuenta: 10 por hora y 50 por día por visitante.',
    },
  );

  tool(
    registry,
    '/metadata',
    'extractMetadata',
    'Metadata',
    MetadataRequest,
    PageMetadataSchema,
    'Metadatos de la página',
    {
      query: LangQuerySchema,
      okDescription:
        'Lee como máximo 1 MiB del documento final y extrae los metadatos por origen y el valor efectivo de una vista previa. No ejecuta scripts. Las URL devueltas son texto: el cliente no debe cargarlas automáticamente. Límite sin cuenta: 10 por hora y 50 por día por visitante.',
    },
  );

  tool(registry, '/tls', 'analyzeTls', 'TLS', TlsRequest, TlsAnalysisSchema, 'Análisis TLS', {
    query: LangQuerySchema,
    okDescription:
      'Conecta a la IP validada del host, completa el handshake y devuelve la cadena de certificados con sus problemas. Un certificado inválido no interrumpe el análisis. Límite sin cuenta: 10 por hora y 50 por día por visitante.',
  });

  tool(registry, '/dns', 'lookupDns', 'DNS', DnsRequest, DnsLookupSchema, 'Consulta DNS', {
    query: LangQuerySchema,
    okDescription:
      'Consulta A, AAAA, CNAME, MX, NS, TXT, CAA y SOA a resolutores validadores fijos por DoH, con el estado DNSSEC. No se acepta un resolutor elegido por el cliente. Se rechazan las IP literales y los nombres de uso especial (400 con dns.ip-literal o dns.special-use). Límite sin cuenta: 10 por hora y 50 por día por visitante.',
    unavailable:
      'Ningún resolutor respondió (dns.unavailable). El cliente puede reintentar; el uso no se descuenta de la cuota.',
  });

  tool(
    registry,
    '/security',
    'reviewSecurity',
    'Security Analysis',
    SecurityRequest,
    SecurityReviewSchema,
    'Revisión de seguridad, posiblemente parcial',
    {
      query: LangQuerySchema,
      okDescription:
        'Reúne en una lista ordenada por gravedad los hallazgos de Explain URL, Redirect Inspector, HTTP Headers, TLS y DNS. No hay nota, puntuación ni veredicto. scope declara qué no se comprueba (reputación, contenido). Cuenta como un único uso. Límite sin cuenta: 10 por hora y 50 por día por visitante.',
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
      version: '1.2.0',
      description:
        'API v1 de URLkit. Anónima y gratuita con limitación de tasa por IP seudonimizada. Las URLs enviadas no se almacenan ni se registran. El esquema `apiKey` está declarado desde esta versión y es opcional. La 1.1.0 añade, de forma compatible, las herramientas de análisis técnico de la v2 del producto. La 1.2.0 activa, de forma compatible, las claves de API de organizaciones: sin clave nada cambia.',
    },
    servers: [
      { url: 'https://api.urlkit.example/v1', description: 'Producción (dominio provisional)' },
    ],
    // `{}` keeps every endpoint usable without credentials; activating keys in v3 is additive.
    security: [{}, { apiKey: [] }],
    tags: [{ name: 'tools' }, { name: 'metrics' }],
  });
}
