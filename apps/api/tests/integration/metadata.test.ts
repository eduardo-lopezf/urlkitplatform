/** Metadata end to end inside the API (002/T039): real undici against local fixture servers. */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSafeFetch } from '../../src/inspect/safe-fetch.ts';
import { createFetchChain } from '../../src/probes/chain.ts';
import { post, testApp } from '../helpers.ts';

const OG = `<html><head><title>Fixture</title>
<meta property="og:title" content="Fixture OG">
<meta property="og:image" content="https://cdn.example.com/og.png">
<link rel="canonical" href="/og"></head><body></body></html>`;

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '/';
    if (path === '/og')
      return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(OG);
    if (path === '/moved') return void res.writeHead(301, { location: '/og' }).end();
    if (path === '/pdf')
      return void res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF-1.7');
    if (path === '/big') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.write('<head><meta property="og:title" content="Grande"></head><body>');
      return void res.end(`<p>${'x'.repeat(2 * 1024 * 1024)}</p>`);
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const relaxed = { policy: { allowedPorts: null, isBlocked: () => false } } as const;
const api = () =>
  testApp({ chainFetcher: () => createFetchChain({ safeFetch: createSafeFetch(relaxed) }) }).app;

describe('POST /v1/metadata with real undici', () => {
  it('extracts Open Graph from a real page', async () => {
    const body = await (await post(api(), '/v1/metadata', { url: `${base}/og` })).json();
    expect(body).toMatchObject({
      finalUrl: `${base}/og`,
      effective: {
        title: { value: 'Fixture OG', from: 'openGraph' },
        image: { value: 'https://cdn.example.com/og.png' },
        url: { value: `${base}/og`, from: 'basic' },
      },
      encoding: { label: 'utf-8', source: 'header' },
    });
  });

  it('follows a redirect before the HTML', async () => {
    const body = await (await post(api(), '/v1/metadata', { url: `${base}/moved` })).json();
    expect(body).toMatchObject({ hops: 1, finalUrl: `${base}/og` });
  });

  it('marks a 2 MiB page as truncated and still finds the tags in the first 1 MiB', async () => {
    const body = await (await post(api(), '/v1/metadata', { url: `${base}/big` })).json();
    expect(body).toMatchObject({ truncated: true, effective: { title: { value: 'Grande' } } });
    expect((body as { warnings: Array<{ code: string }> }).warnings.map((w) => w.code)).toContain(
      'metadata.truncated',
    );
  });

  it('reports a PDF as not HTML', async () => {
    const body = await (await post(api(), '/v1/metadata', { url: `${base}/pdf` })).json();
    expect(body).toMatchObject({
      contentType: 'application/pdf',
      warnings: [{ code: 'metadata.not-html' }],
    });
  });
});
