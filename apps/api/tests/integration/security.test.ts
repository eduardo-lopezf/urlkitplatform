/**
 * Security Analysis inside the API (002/T077): real chain against a local server, a fake DoH
 * that is down, and the per-part time budgets.
 */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSafeFetch } from '../../src/inspect/safe-fetch.ts';
import { createSecurityAdapters } from '../../src/probes/security.ts';
import { post, testApp } from '../helpers.ts';

let server: Server;
let silent: Server;
let port = 0;
let silentPort = 0;
let closedPort = 0;
const hits: string[] = [];

const listen = (s: Server) =>
  new Promise<number>((resolve) =>
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      resolve(typeof a === 'object' && a ? a.port : 0);
    }),
  );

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? '');
    if (req.url === '/go') return void res.writeHead(302, { location: '/end' }).end();
    res.writeHead(200, { 'content-type': 'text/html' }).end('<p>ok</p>');
  });
  port = await listen(server);
  silent = createServer(() => undefined);
  silentPort = await listen(silent);
  const closed = createServer();
  closedPort = await listen(closed);
  await new Promise<void>((resolve) => closed.close(() => resolve()));
});

afterAll(async () => {
  silent.closeAllConnections();
  for (const s of [server, silent]) await new Promise<void>((resolve) => s.close(() => resolve()));
});

const relaxed = {
  resolve: async (host: string) => (host.endsWith('example.org') ? ['127.0.0.1'] : []),
  policy: { allowedPorts: null, isBlocked: () => false },
};
const deadDoh = [
  {
    id: 'cloudflare' as const,
    url: `http://doh.test:${closedPort}/dns-query`,
    address: '127.0.0.1',
  },
];

function app(budgets = { chainMs: 6000, networkMs: 4000 }) {
  return testApp({
    securityAdapters: () =>
      createSecurityAdapters({
        safeFetch: createSafeFetch(relaxed),
        tls: relaxed,
        dns: { resolvers: [{ ...deadDoh[0]!, url: `http://doh.test:${closedPort}/dns-query` }] },
        budgets,
      }),
  });
}

describe('POST /v1/security', () => {
  it('reviews the destination with one use of its own quota and none of the others', async () => {
    const { app: api } = app();
    const res = await post(api, '/v1/security', { url: `http://site.example.org:${port}/go` });
    expect(res.status).toBe(200);
    expect(res.headers.get('RateLimit-Remaining')).toBe('9');
    const body = (await res.json()) as {
      finalUrl: string;
      parts: Record<string, { state: string; reason?: { code: string } }>;
      findings: Array<{ tool: string; code: string }>;
      scope: { notChecked: string[] };
    };
    expect(body.finalUrl).toBe(`http://site.example.org:${port}/end`);
    expect(body.parts).toMatchObject({
      explain: { state: 'complete' },
      redirects: { state: 'complete' },
      headers: { state: 'complete' },
      tls: { state: 'skipped' }, // http destination
      dns: { state: 'incomplete', reason: { code: 'dns.unavailable' } }, // DoH down
    });
    expect(body.findings.some((f) => f.tool === 'headers')).toBe(true);
    expect(body.scope.notChecked).toEqual(['reputation', 'content']);
    // No other quota was touched.
    for (const tool of ['inspect', 'headers', 'tls', 'dns']) {
      const other = await post(
        api,
        `/v1/${tool}`,
        tool === 'tls' || tool === 'dns'
          ? { target: 'example.com' }
          : { url: 'https://example.com/' },
      );
      expect(other.headers.get('RateLimit-Remaining'), tool).toBe('9');
    }
  });

  it('keeps the overall deadline: a part that runs out is incomplete, the rest is kept', async () => {
    const { app: api } = app({ chainMs: 300, networkMs: 300 });
    const started = Date.now();
    const res = await post(api, '/v1/security', { url: `http://site.example.org:${silentPort}/` });
    expect(Date.now() - started).toBeLessThan(3000);
    const body = (await res.json()) as {
      parts: Record<string, { state: string; reason?: { code: string } }>;
      findings: unknown[];
    };
    expect(body.parts.explain?.state).toBe('complete');
    expect(body.parts.redirects).toEqual({
      state: 'incomplete',
      reason: { code: 'inspect.timeout' },
    });
    expect(body.parts.headers?.state).toBe('incomplete');
  });

  it('opens no connection for a blocked input', async () => {
    hits.length = 0;
    const { app: api } = testApp({
      securityAdapters: () =>
        createSecurityAdapters({
          safeFetch: createSafeFetch({ resolve: relaxed.resolve }),
          tls: { resolve: relaxed.resolve },
          dns: { resolvers: deadDoh },
        }),
    });
    const res = await post(api, '/v1/security', { url: `http://site.example.org:${port}/` });
    const body = (await res.json()) as { parts: Record<string, { state: string }> };
    expect(hits).toEqual([]);
    for (const part of ['redirects', 'headers', 'tls', 'dns'])
      expect(body.parts[part]?.state).toBe('skipped');
  });
});
