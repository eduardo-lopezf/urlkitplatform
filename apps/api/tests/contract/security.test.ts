/** POST /v1/security against the designed contract (002/T078). */
import { describe, expect, it } from 'vitest';
import type { ChainObservation } from '@urlkit/core';
import { post, testApp } from '../helpers.ts';
import { expectContract } from './harness.ts';

const observation = (url: string): ChainObservation => ({
  chain: {
    input: url,
    hops: [
      {
        index: 0,
        url,
        status: 301,
        type: 'permanent',
        location: null,
        durationMs: 1,
        flags: ['https-downgrade'],
      },
      {
        index: 1,
        url: 'http://plain.example.com/',
        status: 200,
        type: 'final',
        location: null,
        durationMs: 1,
        flags: [],
      },
    ],
    final: 'http://plain.example.com/',
    stopReason: 'final',
    totalMs: 2,
  },
  finalResponse: {
    status: 200,
    rawHeaders: [['Content-Type', 'text/html']],
    contentType: 'text/html',
    body: null,
    bodyTruncated: false,
  },
});

const adapters = () => ({
  fetchChain: async (url: string) => ({ ok: true as const, value: observation(url) }),
  probeTls: async () => ({ kind: 'error' as const, code: 'tls.timeout' as const }),
  queryDns: async () => ({ kind: 'unavailable' as const }),
});

describe('POST /v1/security contract', () => {
  it('200 returns a SecurityReview, possibly partial, without any score', async () => {
    const { app, deps } = testApp({ securityAdapters: adapters });
    const res = await post(app, '/v1/security', { url: 'https://bit.example/x' });
    expect(res.status).toBe(200);
    const body = (await expectContract(res, 'post', '/security')) as Record<string, unknown>;
    expect(body).toMatchObject({
      finalUrl: 'http://plain.example.com/',
      scope: { notChecked: ['reputation', 'content'] },
      catalogVersion: deps.catalog.version,
      parts: { tls: { state: 'skipped' }, dns: { state: 'incomplete' } },
    });
    expect(Object.keys(body).sort()).toEqual(
      ['catalogVersion', 'finalUrl', 'findings', 'input', 'parts', 'scope'].sort(),
    );
  });

  it('400 for an invalid body or a non-http URL', async () => {
    const { app } = testApp({ securityAdapters: adapters });
    const invalid = await post(app, '/v1/security', {});
    expect(invalid.status).toBe(400);
    await expectContract(invalid, 'post', '/security');
    const scheme = await post(app, '/v1/security', { url: 'ftp://example.com/' });
    expect(scheme.status).toBe(400);
    expect(await expectContract(scheme, 'post', '/security')).toMatchObject({
      code: 'url.unsupported-scheme',
    });
  });

  it('429 after 10 analyses in an hour', async () => {
    const { app } = testApp({ securityAdapters: adapters });
    for (let i = 0; i < 10; i++) await post(app, '/v1/security', { url: 'https://bit.example/x' });
    const res = await post(app, '/v1/security', { url: 'https://bit.example/x' });
    expect(res.status).toBe(429);
    expect(await expectContract(res, 'post', '/security')).toMatchObject({
      code: 'quota.exceeded',
    });
  });

  it('?lang=es adds the text to every finding and part reason', async () => {
    const { app } = testApp({ securityAdapters: adapters });
    const res = await post(app, '/v1/security?lang=es', { url: 'https://bit.example/x' });
    const body = (await expectContract(res, 'post', '/security')) as {
      findings: Array<{ text?: string }>;
      parts: Record<string, { reason?: { text?: string } }>;
    };
    expect(body.findings.length).toBeGreaterThan(0);
    for (const f of body.findings) expect(f.text).toBeTruthy();
    expect(body.parts.tls?.reason?.text).toBeTruthy();
  });
});
