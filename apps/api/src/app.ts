/**
 * Hono app for /v1 (T040). Everything stateful is injected so tests run without network or
 * Valkey: limiter, logger, metrics, clock, the network adapters and the client IP.
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { FetchChain, FetchHop, ProbeTls, QueryDns, RuleCatalog } from '@urlkit/core';
import { buildOpenApiDocument } from '@urlkit/contracts';
import type { Metrics } from './metrics/registry.ts';
import type { SecurityAdapters } from './probes/security.ts';
import { reportError } from './observability/errors.ts';
import type { Logger } from './privacy/logger.ts';
import type { Limiter } from './quota/limiter.ts';
import { registerClean } from './routes/v1/clean.ts';
import { registerDiff } from './routes/v1/diff.ts';
import { registerDns } from './routes/v1/dns.ts';
import { registerExplain } from './routes/v1/explain.ts';
import { registerHeaders } from './routes/v1/headers.ts';
import { registerInspect } from './routes/v1/inspect.ts';
import { registerMetadata } from './routes/v1/metadata.ts';
import { registerMetrics } from './routes/v1/metrics.ts';
import { registerParse } from './routes/v1/parse.ts';
import { registerSecurity } from './routes/v1/security.ts';
import { registerTls } from './routes/v1/tls.ts';

export interface AppDeps {
  catalog: RuleCatalog;
  /** Server secret for the daily pseudonym key. */
  secret: string;
  now: () => number;
  limiter: Limiter;
  logger: Logger;
  metrics: Metrics;
  /** Origin allowed by CORS (the static web). */
  webOrigin: string;
  /** Returns a network adapter for one inspection (it owns that chain's total deadline). */
  inspectFetcher: () => FetchHop;
  /** v2: returns the chain probe of HTTP Headers, Metadata and Security Analysis (002/T022). */
  chainFetcher: () => FetchChain;
  /** v2: returns the TLS connector (002/T060). */
  tlsProber: () => ProbeTls;
  /** v2: returns the DoH client (002/T072). */
  dnsQuerier: () => QueryDns;
  /** v2: the three adapters of Security Analysis, with its time budgets (002/T084). */
  securityAdapters: () => SecurityAdapters;
  clientIp: (c: Context) => string;
}

/** 2 × 32,000 characters for diff, plus JSON overhead. */
const MAX_BODY_BYTES = 128 * 1024;

const invalid = (code: 'request.invalid' | 'request.too-large') => ({ code, message: { code } });

export function createApp(deps: AppDeps) {
  const app = new OpenAPIHono();

  app.use(
    '/v1/*',
    cors({
      origin: deps.webOrigin,
      allowMethods: ['GET', 'POST'],
      allowHeaders: ['content-type'],
      maxAge: 600,
    }),
  );
  app.use(
    '/v1/*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json(invalid('request.too-large'), 400),
    }),
  );

  const v1 = new OpenAPIHono({
    defaultHook: (result, c) =>
      result.success ? undefined : c.json(invalid('request.invalid'), 400),
  });
  registerClean(v1, deps);
  registerParse(v1, deps);
  registerInspect(v1, deps);
  registerDiff(v1, deps);
  registerExplain(v1, deps);
  registerHeaders(v1, deps);
  registerMetadata(v1, deps);
  registerTls(v1, deps);
  registerDns(v1, deps);
  registerSecurity(v1, deps);
  registerMetrics(v1, deps);

  const document = buildOpenApiDocument();
  v1.get('/openapi.json', (c) => c.json(document));
  app.route('/v1', v1);

  // Operational endpoint, never exposed publicly (Caddy answers 404 for /internal/*).
  app.get('/internal/metrics', (c) =>
    c.text(deps.metrics.render(), 200, { 'content-type': 'text/plain; version=0.0.4' }),
  );

  app.notFound((c) => c.json(invalid('request.invalid'), 404));
  app.onError((error, c) => {
    if (error instanceof HTTPException && error.status === 400)
      return c.json(invalid('request.invalid'), 400);
    deps.logger.error('internal.error', { code: 'internal.error', route: c.req.routePath });
    void reportError(error);
    return c.json(
      { code: 'internal.error' as const, message: { code: 'internal.error' as const } },
      500,
    );
  });

  return app;
}
