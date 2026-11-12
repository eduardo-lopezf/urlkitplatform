/**
 * HTTP Headers end to end inside the API (002/T027): real undici against local fixture servers,
 * through the chain probe and the /v1/headers route.
 */
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSafeFetch } from '../../src/inspect/safe-fetch.ts';
import { createFetchChain } from '../../src/probes/chain.ts';
import { post, testApp } from '../helpers.ts';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/tls/${name}`, import.meta.url));

let server: Server;
let tlsServer: HttpsServer;
let base = '';
let tlsBase = '';
const hits: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '/';
    hits.push(path);
    if (path === '/secret-path?token=abc')
      return void res.writeHead(302, { location: '/mid' }).end();
    if (path === '/mid') return void res.writeHead(301, { location: '/end' }).end();
    if (path === '/end')
      return void res
        .writeHead(200, [
          'Content-Type',
          'text/html',
          'X-Content-Type-Options',
          'nosniff',
          'Set-Cookie',
          'sid=TOP-SECRET; HttpOnly',
          'X-Order',
          'last',
        ])
        .end('<p>ok</p>');
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const a = server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;

  tlsServer = createHttpsServer(
    { cert: fixture('self-signed.chain.pem'), key: fixture('self-signed.key') },
    (_req, res) => res.writeHead(200).end('ok'),
  );
  await new Promise<void>((resolve) => tlsServer.listen(0, '127.0.0.1', resolve));
  const b = tlsServer.address();
  tlsBase = `https://localhost:${typeof b === 'object' && b ? b.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => tlsServer.close(() => resolve()));
});

const relaxed = {
  resolve: async (host: string) => (host === 'localhost' ? ['127.0.0.1'] : []),
  policy: { allowedPorts: null, isBlocked: () => false },
} as const;

function app() {
  return testApp({ chainFetcher: () => createFetchChain({ safeFetch: createSafeFetch(relaxed) }) });
}

describe('POST /v1/headers with real undici', () => {
  it('follows 2 redirects and returns the final headers in exact order', async () => {
    hits.length = 0;
    const { app: api } = app();
    const res = await post(api, '/v1/headers', { url: `${base}/secret-path?token=abc` });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hops: number;
      finalUrl: string;
      headers: Array<{ name: string; value: string }>;
    };
    expect(body.hops).toBe(2);
    expect(body.finalUrl).toBe(`${base}/end`);
    expect(hits).toEqual(['/secret-path?token=abc', '/mid', '/end']);
    const own = body.headers.filter((h) => /^(content-type|x-|set-cookie)/i.test(h.name));
    expect(own).toEqual([
      { name: 'Content-Type', value: 'text/html' },
      { name: 'X-Content-Type-Options', value: 'nosniff' },
      { name: 'Set-Cookie', value: '<omitido>' },
      { name: 'X-Order', value: 'last' },
    ]);
    expect(JSON.stringify(body)).not.toContain('TOP-SECRET');
  });

  it('blocks a private target with the default policy, without connecting', async () => {
    hits.length = 0;
    const { app: api } = testApp({
      chainFetcher: () => createFetchChain({ safeFetch: createSafeFetch() }),
    });
    const res = await post(api, '/v1/headers', { url: `${base}/end` });
    // The fixture listens on a random port, so the port rule may block it before the address.
    const body = (await res.json()) as { stopReason: string; error: { code: string }; headers: [] };
    expect(body).toMatchObject({ stopReason: 'blocked', headers: [] });
    expect(body.error.code).toMatch(/^inspect\.blocked\./);
    expect(hits).toEqual([]);
  });

  it('reports a self-signed certificate as inspect.tls', async () => {
    const { app: api } = app();
    const res = await post(api, '/v1/headers', { url: `${tlsBase}/` });
    expect(await res.json()).toMatchObject({ stopReason: 'error', error: { code: 'inspect.tls' } });
  });

  it('logs at most the registrable domain: no path, query, header or cookie values', async () => {
    const { app: api, lines } = app();
    await post(api, '/v1/headers', { url: `${base}/secret-path?token=abc` });
    const logged = lines.join('\n');
    expect(lines.length).toBeGreaterThan(0);
    for (const needle of ['secret-path', 'token=abc', 'TOP-SECRET', 'sid', 'nosniff', 'X-Order'])
      expect(logged).not.toContain(needle);
  });
});
