/**
 * Real undici against a local fixture server (T066). A relaxed policy lets the client reach
 * 127.0.0.1 on a random port; the default policy is asserted to block it.
 */
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inspect } from '@urlkit/core';
import {
  createFetchHop,
  HOP_TIMEOUT_MS,
  MAX_BODY_BYTES,
  TOTAL_TIMEOUT_MS,
} from '../../src/inspect/fetch-hop.ts';
import { createSafeFetch, USER_AGENT } from '../../src/inspect/safe-fetch.ts';

let server: Server;
let base = '';
const seen: Array<{ path: string; headers: IncomingHttpHeaders }> = [];
let bytesSent = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({ path: req.url ?? '', headers: req.headers });
    const path = req.url ?? '/';
    if (path === '/r1')
      return void res.writeHead(301, { location: '/r2', 'set-cookie': 'track=1' }).end();
    if (path === '/r2') return void res.writeHead(302, { location: `${base}/end` }).end();
    if (path === '/end')
      return void res.writeHead(200, { 'content-type': 'text/html' }).end('<p>ok</p>');
    if (path === '/slow') return void setTimeout(() => res.writeHead(200).end(), 1500);
    if (path.startsWith('/step')) {
      const n = Number(path.slice(5));
      return void setTimeout(() => res.writeHead(302, { location: `/step${n + 1}` }).end(), 120);
    }
    if (path === '/meta')
      return void res
        .writeHead(200, { 'content-type': 'text/html' })
        .end('<meta http-equiv="refresh" content="0;url=/end">');
    if (path === '/json-meta')
      return void res
        .writeHead(200, { 'content-type': 'application/json' })
        .end('"<meta http-equiv=\\"refresh\\" content=\\"0;url=/end\\">"');
    if (path === '/huge') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      const chunk = 'x'.repeat(64 * 1024);
      let sent = 0;
      const pump = () => {
        while (sent < 2 * 1024 * 1024) {
          sent += chunk.length;
          bytesSent = sent;
          if (!res.write(chunk)) return void res.once('drain', pump);
        }
        res.end('<meta http-equiv="refresh" content="0;url=/end">');
      };
      res.on('close', () => undefined);
      return pump();
    }
    if (path === '/404') return void res.writeHead(404).end();
    if (path === '/500') return void res.writeHead(500).end();
    res.writeHead(200).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const relaxed = { allowedPorts: null, isBlocked: () => false } as const;
const hop = (overrides: Partial<Parameters<typeof createFetchHop>[0]> = {}) =>
  createFetchHop({ safeFetch: createSafeFetch({ policy: relaxed }), ...overrides });

describe('fetchHop with real undici', () => {
  it('uses the documented limits by default', () => {
    expect([HOP_TIMEOUT_MS, TOTAL_TIMEOUT_MS, MAX_BODY_BYTES]).toEqual([5000, 15_000, 256 * 1024]);
  });

  it('follows a real chain hop by hop, without cookies, with an identifiable User-Agent', async () => {
    seen.length = 0;
    const r = await inspect(`${base}/r1`, hop());
    expect(r).toMatchObject({ ok: true, value: { stopReason: 'final', final: `${base}/end` } });
    expect(r.ok && r.value.hops.map((h) => h.status)).toEqual([301, 302, 200]);
    expect(seen.map((s) => s.path)).toEqual(['/r1', '/r2', '/end']);
    for (const s of seen) {
      expect(s.headers.cookie).toBeUndefined();
      expect(s.headers['user-agent']).toBe(USER_AGENT);
    }
  });

  it('times out a slow hop', async () => {
    const r = await inspect(`${base}/slow`, hop({ hopTimeoutMs: 200 }));
    expect(r).toMatchObject({
      ok: true,
      value: { stopReason: 'timeout', hops: [{ error: { code: 'inspect.timeout' } }] },
    });
  });

  it('enforces the total deadline of the chain', async () => {
    const started = Date.now();
    const r = await inspect(`${base}/step0`, hop({ totalTimeoutMs: 400 }));
    expect(r).toMatchObject({ ok: true, value: { stopReason: 'timeout' } });
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('reads at most 256 KB and only from HTML responses', async () => {
    const meta = await inspect(`${base}/meta`, hop());
    expect(meta.ok && meta.value.hops[0]?.type).toBe('meta-refresh');
    const json = await inspect(`${base}/json-meta`, hop());
    expect(json.ok && json.value.hops[0]?.type).toBe('final');
    const huge = await inspect(`${base}/huge`, hop());
    expect(huge.ok && huge.value.hops[0]?.type).toBe('final'); // the refresh sits after the cap
    expect(bytesSent).toBeLessThan(2 * 1024 * 1024);
  });

  it('reports 4xx and 5xx as the final hop', async () => {
    for (const status of [404, 500]) {
      const r = await inspect(`${base}/${status}`, hop());
      expect(r).toMatchObject({
        ok: true,
        value: { stopReason: 'final', hops: [{ status, type: 'final' }] },
      });
    }
  });

  it('stops at a TLS error with inspect.tls', async () => {
    const r = await inspect(base.replace('http:', 'https:') + '/end', hop());
    expect(r).toMatchObject({
      ok: true,
      value: { stopReason: 'error', hops: [{ error: { code: 'inspect.tls' } }] },
    });
  });

  it('ignores proxy environment variables', async () => {
    const saved = { HTTP_PROXY: process.env.HTTP_PROXY, HTTPS_PROXY: process.env.HTTPS_PROXY };
    process.env.HTTP_PROXY = process.env.HTTPS_PROXY = 'http://127.0.0.1:9';
    try {
      const r = await inspect(`${base}/end`, hop());
      expect(r).toMatchObject({ ok: true, value: { stopReason: 'final' } });
    } finally {
      Object.assign(process.env, saved);
      for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
    }
  });

  it('blocks the fixture with the default policy without connecting', async () => {
    seen.length = 0;
    const r = await inspect(`${base}/end`, createFetchHop({ safeFetch: createSafeFetch() }));
    expect(r).toMatchObject({ ok: true, value: { stopReason: 'blocked' } });
    expect(seen).toEqual([]);
  });
});
