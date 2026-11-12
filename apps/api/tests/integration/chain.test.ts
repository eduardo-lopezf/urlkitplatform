/**
 * Chain probe (002/T010): the inspector's chain, keeping only the final response's raw headers
 * and, when asked, up to 1 MiB of its HTML body. One request per hop.
 */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSafeFetch } from '../../src/inspect/safe-fetch.ts';
import { createFetchChain, METADATA_BODY_BYTES } from '../../src/probes/chain.ts';

let server: Server;
let base = '';
const hits: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '/';
    hits.push(path);
    if (path === '/r1') return void res.writeHead(301, ['Location', '/r2', 'X-Hop', '1']).end();
    if (path === '/r2') return void res.writeHead(302, ['Location', '/end', 'X-Hop', '2']).end();
    if (path === '/end')
      return void res
        .writeHead(200, ['Content-Type', 'text/html; charset=utf-8', 'X-Final', 'yes'])
        .end('<title>Fin</title>');
    if (path === '/big') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.write('<title>Grande</title>');
      return void res.end('x'.repeat(2 * 1024 * 1024));
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const relaxed = { allowedPorts: null, isBlocked: () => false } as const;
const chain = () => createFetchChain({ safeFetch: createSafeFetch({ policy: relaxed }) });

describe('fetchChain', () => {
  it('uses 1 MiB as the metadata body cap', () => {
    expect(METADATA_BODY_BYTES).toBe(1024 * 1024);
  });

  it('follows the chain and keeps only the final response raw headers', async () => {
    hits.length = 0;
    const r = await chain()(`${base}/r1`, { body: 'none' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.chain.stopReason).toBe('final');
    expect(r.value.chain.hops).toHaveLength(3);
    expect(hits).toEqual(['/r1', '/r2', '/end']); // one request per hop, no second GET
    const final = r.value.finalResponse;
    expect(final?.status).toBe(200);
    expect(final?.rawHeaders.filter(([n]) => n.startsWith('X-'))).toEqual([['X-Final', 'yes']]);
    expect(final?.contentType).toBe('text/html; charset=utf-8');
    expect(final?.body).toBeNull();
  });

  it('reads the HTML body when asked', async () => {
    const r = await chain()(`${base}/end`, { body: 'html' });
    expect(r.ok && new TextDecoder().decode(r.value.finalResponse?.body ?? new Uint8Array())).toBe(
      '<title>Fin</title>',
    );
    expect(r.ok && r.value.finalResponse?.bodyTruncated).toBe(false);
  });

  it('caps the body at 1 MiB and says it was truncated', async () => {
    const r = await chain()(`${base}/big`, { body: 'html' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.finalResponse?.body?.byteLength).toBe(METADATA_BODY_BYTES);
    expect(r.value.finalResponse?.bodyTruncated).toBe(true);
  });

  it('returns no final response for a blocked target', async () => {
    const r = await createFetchChain({ safeFetch: createSafeFetch() })(`${base}/end`, {
      body: 'none',
    });
    expect(r).toMatchObject({
      ok: true,
      value: { chain: { stopReason: 'blocked' }, finalResponse: null },
    });
  });

  it('passes input errors through as a ToolError', async () => {
    const r = await chain()('javascript:alert(1)', { body: 'none' });
    expect(r).toMatchObject({ ok: false, error: { code: 'url.unsupported-scheme' } });
  });
});
