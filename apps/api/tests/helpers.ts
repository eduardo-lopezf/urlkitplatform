import { catalog } from '@urlkit/rules';
import { createApp, type AppDeps } from '../src/app.ts';
import { createLogger } from '../src/privacy/logger.ts';
import { createLimiter } from '../src/quota/limiter.ts';
import { MemoryStore } from '../src/quota/store.ts';
import { createMetrics } from '../src/metrics/registry.ts';
import { disabledVerifier } from '../src/auth/verify.ts';
import { noUsageRecorder } from '../src/usage/record.ts';

export const SECRET = 'test-secret-with-enough-entropy-0123456789';
export const T0 = Date.UTC(2026, 10, 6, 10, 0, 0); // 2026-11-06T10:00:00Z

export function testApp(overrides: Partial<AppDeps> = {}) {
  const lines: string[] = [];
  let now = T0;
  const clock = {
    now: () => now,
    set: (ms: number) => (now = ms),
    advance: (ms: number) => (now += ms),
  };
  const store = new MemoryStore(() => clock.now());
  const deps: AppDeps = {
    catalog,
    secret: SECRET,
    now: clock.now,
    limiter: createLimiter({ store, now: clock.now }),
    logger: createLogger((line) => lines.push(line)),
    metrics: createMetrics(),
    webOrigin: 'http://localhost:4321',
    inspectFetcher: () => async () => ({
      kind: 'response',
      status: 200,
      location: null,
      html: null,
      durationMs: 5,
    }),
    chainFetcher: () => async (url) => ({
      ok: true,
      value: {
        chain: {
          input: url,
          hops: [
            { index: 0, url, status: 200, type: 'final', location: null, durationMs: 5, flags: [] },
          ],
          final: url,
          stopReason: 'final',
          totalMs: 5,
        },
        finalResponse: {
          status: 200,
          rawHeaders: [['Content-Type', 'text/html']],
          contentType: 'text/html',
          body: null,
          bodyTruncated: false,
        },
      },
    }),
    tlsProber: () => async () => ({ kind: 'error', code: 'tls.refused' }),
    dnsQuerier: () => async () => ({ kind: 'unavailable' }),
    securityAdapters: () => ({
      fetchChain: deps.chainFetcher(),
      probeTls: deps.tlsProber(),
      queryDns: deps.dnsQuerier(),
    }),
    clientIp: (c) => c.req.header('x-test-ip') ?? '203.0.113.7',
    keyVerifier: disabledVerifier,
    usageRecorder: noUsageRecorder,
    ...overrides,
  };
  return { app: createApp(deps), deps, lines, clock, store };
}

export function post(
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
