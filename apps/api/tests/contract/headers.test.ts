/** POST /v1/headers against the designed contract (002/T026). */
import { describe, expect, it } from 'vitest';
import type { ChainObservation, FetchChain } from '@urlkit/core';
import { post, testApp } from '../helpers.ts';
import { expectContract } from './harness.ts';

function observation(url: string): ChainObservation {
  return {
    chain: {
      input: url,
      hops: [
        {
          index: 0,
          url,
          status: 301,
          type: 'permanent',
          location: '/fin',
          durationMs: 3,
          flags: [],
        },
        {
          index: 1,
          url: `${url}fin`,
          status: 200,
          type: 'final',
          location: null,
          durationMs: 4,
          flags: [],
        },
      ],
      final: `${url}fin`,
      stopReason: 'final',
      totalMs: 7,
    },
    finalResponse: {
      status: 200,
      rawHeaders: [
        ['Content-Type', 'text/html'],
        ['Set-Cookie', 'sid=123; Secure; HttpOnly; SameSite=Strict'],
        ['Strict-Transport-Security', 'max-age=31536000'],
      ],
      contentType: 'text/html',
      body: null,
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

describe('POST /v1/headers contract', () => {
  it('200 returns a HeadersAnalysis with the catalog version', async () => {
    const { app, deps } = testApp({ chainFetcher: chainOf(observation) });
    const res = await post(app, '/v1/headers', { url: 'https://example.com/' });
    expect(res.status).toBe(200);
    expect(res.headers.get('RateLimit-Limit')).toBe('10');
    const body = (await expectContract(res, 'post', '/headers')) as Record<string, unknown>;
    expect(body).toMatchObject({
      finalUrl: 'https://example.com/fin',
      hops: 1,
      status: 200,
      catalogVersion: deps.catalog.version,
      cookies: [{ name: 'sid', secure: true, httpOnly: true, sameSite: 'strict' }],
    });
    expect(JSON.stringify(body)).not.toContain('123');
  });

  it('200 for a blocked target, reported in the result', async () => {
    const blocked = (url: string): ChainObservation => ({
      chain: {
        input: url,
        hops: [
          {
            index: 0,
            url,
            status: null,
            type: 'final',
            location: null,
            durationMs: 0,
            flags: [],
            error: { code: 'inspect.blocked.private-address' },
          },
        ],
        final: null,
        stopReason: 'blocked',
        totalMs: 0,
      },
      finalResponse: null,
    });
    const { app } = testApp({ chainFetcher: chainOf(blocked) });
    const res = await post(app, '/v1/headers', { url: 'http://10.0.0.1/' });
    expect(res.status).toBe(200);
    expect(await expectContract(res, 'post', '/headers')).toMatchObject({
      stopReason: 'blocked',
      error: { code: 'inspect.blocked.private-address' },
    });
  });

  it('400 for an invalid body or a core input error', async () => {
    const { app } = testApp({ chainFetcher: chainOf(() => null) });
    const invalid = await post(app, '/v1/headers', { nope: true });
    expect(invalid.status).toBe(400);
    expect(await expectContract(invalid, 'post', '/headers')).toMatchObject({
      code: 'request.invalid',
    });
    const core = await post(app, '/v1/headers', { url: 'https://example.com/' });
    expect(core.status).toBe(400);
    expect(await expectContract(core, 'post', '/headers')).toMatchObject({ code: 'url.invalid' });
  });

  it('429 after 10 requests in an hour, without touching the inspect quota', async () => {
    const { app } = testApp({ chainFetcher: chainOf(observation) });
    for (let i = 0; i < 10; i++) await post(app, '/v1/headers', { url: 'https://example.com/' });
    const res = await post(app, '/v1/headers', { url: 'https://example.com/' });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await expectContract(res, 'post', '/headers')).toMatchObject({ code: 'quota.exceeded' });
    const inspect = await post(app, '/v1/inspect', { url: 'https://example.com/' });
    expect(inspect.status).toBe(200);
  });

  it('?lang=es adds the text to every finding', async () => {
    const { app } = testApp({ chainFetcher: chainOf(observation) });
    const res = await post(app, '/v1/headers?lang=es', { url: 'https://example.com/' });
    const body = (await expectContract(res, 'post', '/headers')) as {
      security: Array<{ findings: Array<{ code: string; text?: string }> }>;
    };
    const findings = body.security.flatMap((c) => c.findings);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(f.text, f.code).toBeTruthy();
  });
});
