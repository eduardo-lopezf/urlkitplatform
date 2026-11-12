/** POST /v1/tls against the designed contract (002/T052). */
import { describe, expect, it } from 'vitest';
import type { ProbeTls, TlsObservation } from '@urlkit/core';
import { post, testApp } from '../helpers.ts';
import { expectContract } from './harness.ts';

const HANDSHAKE: TlsObservation = {
  kind: 'handshake',
  observedAt: '2026-11-11T12:00:00.000Z',
  host: 'example.com',
  port: 443,
  sniSent: true,
  protocol: 'TLSv1.3',
  cipher: 'TLS_AES_256_GCM_SHA384',
  alpn: 'h2',
  authorized: false,
  authorizationError: 'CERT_HAS_EXPIRED',
  hostMatches: true,
  chain: [
    {
      subject: 'CN=example.com',
      issuer: 'CN=CA',
      subjectAltNames: ['DNS:example.com'],
      serialNumber: '0A',
      validFrom: '2025-01-01T00:00:00.000Z',
      validTo: '2026-01-01T00:00:00.000Z',
      signatureAlgorithm: 'ecdsa-with-SHA256',
      fingerprint256: 'AB:CD',
      isCa: false,
      selfIssued: false,
      sct: { status: 'embedded', count: 2 },
    },
  ],
};

const prober =
  (result: Awaited<ReturnType<ProbeTls>>): (() => ProbeTls) =>
  () =>
  async () =>
    result;

describe('POST /v1/tls contract', () => {
  it('200 returns a TlsAnalysis with the catalog version', async () => {
    const { app, deps } = testApp({ tlsProber: prober(HANDSHAKE) });
    const res = await post(app, '/v1/tls', { target: 'https://example.com/' });
    expect(res.status).toBe(200);
    expect(res.headers.get('RateLimit-Limit')).toBe('10');
    expect(await expectContract(res, 'post', '/tls')).toMatchObject({
      host: { ascii: 'example.com' },
      trust: 'untrusted',
      problems: [{ code: 'tls.expired' }],
      chain: [{ daysRemaining: -315 }], // floor of -314.5 days
      transparency: { status: 'embedded', count: 2 },
      catalogVersion: deps.catalog.version,
    });
  });

  it('200 for a blocked target, reported in the result', async () => {
    const { app } = testApp({
      tlsProber: prober({ kind: 'blocked', code: 'inspect.blocked.private-address' }),
    });
    const res = await post(app, '/v1/tls', { target: '10.0.0.1' });
    expect(res.status).toBe(200);
    expect(await expectContract(res, 'post', '/tls')).toMatchObject({
      host: { ip: '10.0.0.1' },
      blocked: { code: 'inspect.blocked.private-address' },
      chain: [],
    });
  });

  it('400 for an empty or invalid target', async () => {
    const { app } = testApp({ tlsProber: prober(HANDSHAKE) });
    for (const body of [{ target: '' }, { url: 'https://example.com/' }]) {
      const res = await post(app, '/v1/tls', body);
      expect(res.status).toBe(400);
      expect(await expectContract(res, 'post', '/tls')).toMatchObject({
        code: 'request.invalid',
      });
    }
    const res = await post(app, '/v1/tls', { target: 'mailto:x@example.com' });
    expect(res.status).toBe(400);
    expect(await expectContract(res, 'post', '/tls')).toMatchObject({ code: 'host.invalid' });
  });

  it('429 after 10 requests in an hour', async () => {
    const { app } = testApp({ tlsProber: prober(HANDSHAKE) });
    for (let i = 0; i < 10; i++) await post(app, '/v1/tls', { target: 'example.com' });
    const res = await post(app, '/v1/tls', { target: 'example.com' });
    expect(res.status).toBe(429);
    expect(await expectContract(res, 'post', '/tls')).toMatchObject({ code: 'quota.exceeded' });
  });

  it('?lang=es adds the text to every problem', async () => {
    const { app } = testApp({ tlsProber: prober(HANDSHAKE) });
    const res = await post(app, '/v1/tls?lang=es', { target: 'example.com' });
    const body = (await expectContract(res, 'post', '/tls')) as {
      problems: Array<{ text?: string }>;
    };
    expect(body.problems[0]?.text).toBeTruthy();
  });
});
