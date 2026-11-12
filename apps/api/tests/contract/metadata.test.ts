/** POST /v1/metadata against the designed contract (002/T038). */
import { describe, expect, it } from 'vitest';
import type { ChainObservation, FetchChain } from '@urlkit/core';
import { post, testApp } from '../helpers.ts';
import { expectContract } from './harness.ts';

const HTML = `<html lang="es"><head><title>Hola</title>
<meta property="og:title" content="Hola OG">
<meta property="og:image" content="/i.png"></head></html>`;

function observation(url: string, contentType = 'text/html'): ChainObservation {
  return {
    chain: {
      input: url,
      hops: [
        { index: 0, url, status: 200, type: 'final', location: null, durationMs: 3, flags: [] },
      ],
      final: url,
      stopReason: 'final',
      totalMs: 3,
    },
    finalResponse: {
      status: 200,
      rawHeaders: [['Content-Type', contentType]],
      contentType,
      body: new TextEncoder().encode(HTML),
      bodyTruncated: false,
    },
  };
}

const chainOf =
  (fn: (url: string) => ChainObservation | null): (() => FetchChain) =>
  () =>
  async (url) => {
    const value = fn(url);
    return value
      ? { ok: true, value }
      : { ok: false, error: { code: 'url.invalid', message: { code: 'url.invalid' } } };
  };

describe('POST /v1/metadata contract', () => {
  it('200 returns PageMetadata with the catalog version', async () => {
    const { app, deps } = testApp({ chainFetcher: chainOf((u) => observation(u)) });
    const res = await post(app, '/v1/metadata', { url: 'https://example.com/' });
    expect(res.status).toBe(200);
    expect(res.headers.get('RateLimit-Limit')).toBe('10');
    expect(await expectContract(res, 'post', '/metadata')).toMatchObject({
      catalogVersion: deps.catalog.version,
      effective: {
        title: { value: 'Hola OG', from: 'openGraph' },
        image: { value: 'https://example.com/i.png', from: 'openGraph' },
      },
      encoding: { label: 'windows-1252', source: 'default' },
    });
  });

  it('200 for a non-HTML response', async () => {
    const { app } = testApp({
      chainFetcher: chainOf((u) => observation(u, 'application/pdf')),
    });
    const res = await post(app, '/v1/metadata', { url: 'https://example.com/a.pdf' });
    expect(await expectContract(res, 'post', '/metadata')).toMatchObject({
      warnings: [{ code: 'metadata.not-html' }],
    });
  });

  it('400 for an invalid body or a core input error', async () => {
    const { app } = testApp({ chainFetcher: chainOf(() => null) });
    const invalid = await post(app, '/v1/metadata', { url: 7 });
    expect(invalid.status).toBe(400);
    await expectContract(invalid, 'post', '/metadata');
    const core = await post(app, '/v1/metadata', { url: 'https://example.com/' });
    expect(core.status).toBe(400);
    expect(await expectContract(core, 'post', '/metadata')).toMatchObject({ code: 'url.invalid' });
  });

  it('429 after 10 requests in an hour, without touching the headers quota', async () => {
    const { app } = testApp({ chainFetcher: chainOf((u) => observation(u)) });
    for (let i = 0; i < 10; i++) await post(app, '/v1/metadata', { url: 'https://example.com/' });
    const res = await post(app, '/v1/metadata', { url: 'https://example.com/' });
    expect(res.status).toBe(429);
    expect(await expectContract(res, 'post', '/metadata')).toMatchObject({
      code: 'quota.exceeded',
    });
    expect((await post(app, '/v1/headers', { url: 'https://example.com/' })).status).toBe(200);
  });

  it('?lang=en adds the text to every warning', async () => {
    const { app } = testApp({ chainFetcher: chainOf((u) => observation(u)) });
    const res = await post(app, '/v1/metadata?lang=en', { url: 'https://example.com/' });
    const body = (await expectContract(res, 'post', '/metadata')) as {
      warnings: Array<{ code: string; text?: string }>;
    };
    expect(body.warnings.length).toBeGreaterThan(0);
    for (const w of body.warnings) expect(w.text, w.code).toBeTruthy();
  });
});
