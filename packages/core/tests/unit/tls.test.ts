/** TLS: problems of a certificate from a synthetic observation (002/T049). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeHost,
  analyzeTls,
  tlsTool,
  type CertObservation,
  type HostInfo,
  type TlsAnalysis,
  type TlsObservation,
} from '../../src/index.ts';
import { catalog, criteria } from '../fixtures/catalog.ts';

const CATALOG = catalog({ version: '7.7.7-test', security: criteria() }); // expiringSoonDays: 10
const NOW = '2026-11-11T12:00:00.000Z';
const DAY = 86_400_000;
const at = (days: number) => new Date(Date.parse(NOW) + days * DAY).toISOString();

const host = (input: string): HostInfo => {
  const r = analyzeHost(input);
  if (!r.ok) throw new Error(input);
  return r.value;
};

function cert(overrides: Partial<CertObservation> = {}): CertObservation {
  return {
    subject: 'CN=example.com',
    issuer: 'CN=Test CA',
    subjectAltNames: ['DNS:example.com'],
    serialNumber: '01',
    validFrom: at(-30),
    validTo: at(90),
    signatureAlgorithm: 'ecdsa-with-SHA256',
    fingerprint256: 'AA:BB',
    isCa: false,
    selfIssued: false,
    ...overrides,
  };
}

const ROOT = cert({
  subject: 'CN=Test Root',
  issuer: 'CN=Test Root',
  isCa: true,
  selfIssued: true,
  signatureAlgorithm: 'sha1WithRSAEncryption', // a root's own signature does not matter
});

function observe(overrides: Partial<TlsObservation> = {}): TlsObservation {
  return {
    kind: 'handshake',
    observedAt: NOW,
    host: 'example.com',
    port: 443,
    sniSent: true,
    protocol: 'TLSv1.3',
    cipher: 'TLS_AES_128_GCM_SHA256',
    alpn: 'h2',
    authorized: true,
    authorizationError: null,
    hostMatches: true,
    chain: [{ ...cert(), sct: { status: 'embedded', count: 2 } }, ROOT],
    ...overrides,
  };
}

const run = (o: TlsObservation, input = 'example.com') =>
  analyzeTls({ input, host: host(input), port: 443 }, o, CATALOG);
const codes = (r: TlsAnalysis) => r.problems.map((p) => p.code);

afterEach(() => vi.useRealTimers());

describe('valid certificate', () => {
  it('is trusted and describes the connection and the chain', () => {
    const r = run(observe());
    expect(r).toMatchObject({
      input: 'example.com',
      host: { unicode: 'example.com', ascii: 'example.com' },
      port: 443,
      protocol: 'TLSv1.3',
      cipher: 'TLS_AES_128_GCM_SHA256',
      alpn: 'h2',
      sniSent: true,
      trust: 'trusted',
      problems: [],
      transparency: { status: 'embedded', count: 2 },
      catalogVersion: '7.7.7-test',
    });
    expect(r.chain).toHaveLength(2);
    expect(r.chain[0]).toMatchObject({ subject: 'CN=example.com', daysRemaining: 90, isCa: false });
  });
});

describe('problems from the OpenSSL verification error', () => {
  it.each([
    ['CERT_HAS_EXPIRED', 'tls.expired'],
    ['CERT_NOT_YET_VALID', 'tls.not-yet-valid'],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'tls.self-signed'],
    ['SELF_SIGNED_CERT_IN_CHAIN', 'tls.self-signed'],
    ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'tls.incomplete-chain'],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'tls.incomplete-chain'],
    ['CERT_REVOKED', 'tls.untrusted-root'],
  ])('%s → %s', (error, code) => {
    const r = run(observe({ authorized: false, authorizationError: error }));
    expect(codes(r)).toContain(code);
    expect(r.trust).toBe('untrusted');
  });
});

describe('checks without an OpenSSL error', () => {
  it('a name mismatch makes the certificate untrusted', () => {
    const r = run(observe({ hostMatches: false }));
    expect(codes(r)).toEqual(['tls.name-mismatch']);
    expect(r.trust).toBe('untrusted');
  });

  it('dates are compared with observedAt: expired, not yet valid, expiring soon', () => {
    expect(codes(run(observe({ chain: [cert({ validTo: at(-3) })] })))).toContain('tls.expired');
    expect(run(observe({ chain: [cert({ validTo: at(-3) })] })).chain[0]?.daysRemaining).toBe(-3);
    expect(codes(run(observe({ chain: [cert({ validFrom: at(2) })] })))).toContain(
      'tls.not-yet-valid',
    );
    const soon = run(observe({ chain: [cert({ validTo: at(5) })] }));
    expect(soon.problems).toEqual([{ code: 'tls.expiring-soon', params: { days: 5 } }]);
    expect(soon.trust).toBe('trusted');
  });

  it('a problem is reported once even when OpenSSL and the dates agree', () => {
    const r = run(
      observe({
        authorized: false,
        authorizationError: 'CERT_HAS_EXPIRED',
        chain: [cert({ validTo: at(-1) })],
      }),
    );
    expect(codes(r).filter((c) => c === 'tls.expired')).toHaveLength(1);
  });

  it('weak signatures of the leaf or an intermediate, never of the root', () => {
    expect(codes(run(observe()))).not.toContain('tls.weak-signature');
    const r = run(observe({ chain: [cert({ signatureAlgorithm: 'ecdsa-with-SHA1' }), ROOT] }));
    expect(r.problems).toContainEqual({
      code: 'tls.weak-signature',
      params: { algorithm: 'ecdsa-with-SHA1' },
    });
  });

  it('legacy protocols', () => {
    expect(run(observe({ protocol: 'TLSv1.1' })).problems).toContainEqual({
      code: 'tls.legacy-protocol',
      params: { protocol: 'TLSv1.1' },
    });
  });
});

describe('inputs and failures', () => {
  it('an IP literal gives { ip } and passes sniSent through', () => {
    const r = run(observe({ sniSent: false }), '93.184.215.14');
    expect(r.host).toEqual({ ip: '93.184.215.14' });
    expect(r.sniSent).toBe(false);
  });

  it('a blocked target has no chain', () => {
    const r = analyzeTls(
      { input: 'intranet.example', host: host('intranet.example'), port: 443 },
      { kind: 'blocked', code: 'inspect.blocked.private-address' },
      CATALOG,
    );
    expect(r).toMatchObject({
      blocked: { code: 'inspect.blocked.private-address' },
      chain: [],
      problems: [],
    });
    expect(r.trust).toBeUndefined();
  });

  it('a connection failure is reported as error', () => {
    const r = analyzeTls(
      { input: 'example.com', host: host('example.com'), port: 443 },
      { kind: 'error', code: 'tls.timeout' },
      CATALOG,
    );
    expect(r).toMatchObject({ error: { code: 'tls.timeout' }, chain: [] });
  });

  it('transparency is unknown when the leaf carries no SCT data', () => {
    expect(run(observe({ chain: [cert()] })).transparency).toEqual({ status: 'unknown', count: 0 });
  });
});

describe('no clock', () => {
  it('gives the same result whatever the current time is', () => {
    vi.useFakeTimers({ now: Date.parse('2030-01-01T00:00:00Z') });
    const a = run(observe());
    vi.setSystemTime(Date.parse('2001-01-01T00:00:00Z'));
    expect(run(observe())).toEqual(a);
  });
});

describe('tlsTool', () => {
  it('probes the host with its port and SNI, and declares its registry entry', async () => {
    const calls: unknown[] = [];
    const r = await tlsTool.run(
      { target: 'https://münchen.de:8443/x' },
      {
        catalog: CATALOG,
        probeTls: async (target) => {
          calls.push(target);
          return observe({ host: target.host, port: target.port });
        },
      },
    );
    expect(calls).toEqual([{ host: 'xn--mnchen-3ya.de', port: 8443, sni: true }]);
    expect(r).toMatchObject({ ok: true, value: { port: 8443, host: { unicode: 'münchen.de' } } });

    await tlsTool.run(
      { target: '[2606:2800::1]' },
      { catalog: CATALOG, probeTls: async (t) => (calls.push(t), observe()) },
    );
    expect(calls[1]).toEqual({ host: '[2606:2800::1]', port: 443, sni: false });

    expect(tlsTool).toMatchObject({
      id: 'tls',
      runsOn: 'server',
      sendTo: ['headers', 'dns', 'security'],
    });
    expect(tlsTool.share.decode(tlsTool.share.encode({ target: 'example.com' }))).toEqual({
      target: 'example.com',
    });
  });

  it('returns host.invalid for a target without host', async () => {
    const r = await tlsTool.run({ target: 'mailto:x@example.com' }, { catalog: CATALOG });
    expect(r).toMatchObject({ ok: false, error: { code: 'host.invalid' } });
  });
});
