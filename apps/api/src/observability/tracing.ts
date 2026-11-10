/**
 * Operational traces (research R8, docs/arquitectura.md §12): span attributes are limited to the
 * registrable domain, status and duration. Never path, query, fragment or IP.
 * Only manual spans: HTTP auto-instrumentation is deliberately not used, because it records URLs.
 */
import { trace, type Attributes, type Span } from '@opentelemetry/api';

const ALLOWED = new Set([
  'urlkit.tool',
  'urlkit.outcome',
  'urlkit.stop_reason',
  'urlkit.hops',
  'url.registrable_domain',
  'http.response.status_code',
  'urlkit.duration_ms',
]);

export function safeAttributes(input: Record<string, unknown>): Attributes {
  const out: Attributes = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED.has(key)) continue;
    if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string' && !/[/?#@:]/.test(value)) out[key] = value;
  }
  return out;
}

export async function withSpan<T>(
  name: string,
  attributes: Record<string, unknown>,
  fn: (span: { set(attributes: Record<string, unknown>): void }) => Promise<T>,
): Promise<T> {
  return trace.getTracer('urlkit-api').startActiveSpan(name, async (span: Span) => {
    try {
      span.setAttributes(safeAttributes(attributes));
      return await fn({ set: (more) => span.setAttributes(safeAttributes(more)) });
    } finally {
      span.end();
    }
  });
}

/** Registers the SDK only when an OTLP endpoint is configured. */
export async function initTracing(env: NodeJS.ProcessEnv): Promise<void> {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;
  const [
    { NodeTracerProvider, BatchSpanProcessor },
    { OTLPTraceExporter },
    { resourceFromAttributes },
  ] = await Promise.all([
    import('@opentelemetry/sdk-trace-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/resources'),
  ]);
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'urlkit-api' }),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
      ),
    ],
  });
  provider.register();
}
