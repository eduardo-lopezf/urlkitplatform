/** Security Analysis: findings from synthetic part results (002/T076). */
import { describe, expect, it } from 'vitest';
import {
  review,
  securityTool,
  type ChainObservation,
  type DnsLookup,
  type Explanation,
  type HeadersAnalysis,
  type RedirectChain,
  type ReviewParts,
  type TlsAnalysis,
} from '../../src/index.ts';
import { catalog, criteria } from '../fixtures/catalog.ts';

const CATALOG = catalog({
  version: '2.2.2-test',
  security: criteria({
    severities: {
      'tls.expired': 'high',
      'headers.hsts.missing': 'medium',
      'security.hop.https-downgrade': 'high',
      'dns.no-caa': 'low',
    },
  }),
  metadata: {
    precedence: {
      title: ['basic'],
      description: ['basic'],
      image: ['openGraph'],
      url: ['basic'],
      siteName: ['openGraph'],
      type: ['openGraph'],
    },
  },
});

const explanation = (signals: Explanation['signals'] = []): Explanation =>
  ({ url: {} as Explanation['url'], parts: [], signals, catalogVersion: 'x' }) as Explanation;

const redirects = (flags: RedirectChain['hops'][number]['flags'] = []): RedirectChain => ({
  input: 'https://bit.example/x',
  hops: [
    {
      index: 0,
      url: 'https://bit.example/x',
      status: 301,
      type: 'permanent',
      location: null,
      durationMs: 1,
      flags,
    },
    {
      index: 1,
      url: 'http://shop.example/',
      status: 200,
      type: 'final',
      location: null,
      durationMs: 1,
      flags: [],
    },
  ],
  final: 'http://shop.example/',
  stopReason: 'final',
  totalMs: 2,
});

const headers = {
  security: [
    {
      header: 'strict-transport-security',
      state: 'missing',
      findings: [{ code: 'headers.hsts.missing' }],
    },
  ],
  cookies: [],
} as unknown as HeadersAnalysis;
const tls = {
  problems: [{ code: 'tls.expired', params: { date: '2026-01-01' } }],
} as unknown as TlsAnalysis;
const dns = { warnings: [{ code: 'dns.no-caa' }] } as unknown as DnsLookup;

function parts(over: Partial<ReviewParts> = {}): ReviewParts {
  return {
    input: 'https://bit.example/x',
    explain: { state: 'complete', value: explanation() },
    redirects: { state: 'complete', value: redirects(['https-downgrade', 'domain-change']) },
    headers: { state: 'complete', value: headers },
    tls: { state: 'complete', value: tls },
    dns: { state: 'complete', value: dns },
    ...over,
  };
}

describe('review', () => {
  it('turns every part into findings with code, severity, tool and params', () => {
    const r = review(parts(), CATALOG);
    expect(r.findings).toEqual([
      {
        code: 'security.hop.https-downgrade',
        severity: 'high',
        tool: 'inspect',
        params: { host: 'bit.example' },
      },
      { code: 'tls.expired', severity: 'high', tool: 'tls', params: { date: '2026-01-01' } },
      { code: 'headers.hsts.missing', severity: 'medium', tool: 'headers' },
      { code: 'dns.no-caa', severity: 'low', tool: 'dns' },
      // No severity in the catalog: informational by default.
      {
        code: 'security.hop.domain-change',
        severity: 'info',
        tool: 'inspect',
        params: { host: 'bit.example' },
      },
    ]);
    expect(r).toMatchObject({
      input: 'https://bit.example/x',
      finalUrl: 'http://shop.example/',
      catalogVersion: '2.2.2-test',
    });
  });

  it('orders by severity and, at equal severity, by tool', () => {
    const r = review(
      parts({
        explain: {
          state: 'complete',
          value: explanation([
            {
              id: 'userinfo-deception',
              severity: 'caution',
              message: { code: 'explain.signal.userinfo-deception' },
              evidence: 'x',
            },
          ]),
        },
        dns: {
          state: 'complete',
          value: { warnings: [{ code: 'dns.bogus' }] } as unknown as DnsLookup,
        },
      }),
      catalog({
        security: criteria({
          severities: { 'dns.bogus': 'medium', 'headers.hsts.missing': 'medium' },
        }),
      }),
    );
    const medium = r.findings.filter((f) => f.severity === 'medium').map((f) => f.tool);
    expect(medium).toEqual(['explain', 'headers', 'dns']);
  });

  it('maps Explain URL caution to medium and info to info unless the catalog says otherwise', () => {
    const r = review(
      parts({
        explain: {
          state: 'complete',
          value: explanation([
            {
              id: 'ip-host',
              severity: 'caution',
              message: { code: 'explain.signal.ip-host' },
              evidence: '1.2.3.4',
            },
            {
              id: 'abuse-tld',
              severity: 'info',
              message: { code: 'explain.signal.abuse-tld', params: { tld: 'zip' } },
              evidence: 'zip',
            },
          ]),
        },
      }),
      CATALOG,
    );
    expect(r.findings.filter((f) => f.tool === 'explain')).toEqual([
      { code: 'explain.signal.ip-host', severity: 'medium', tool: 'explain' },
      {
        code: 'explain.signal.abuse-tld',
        severity: 'info',
        tool: 'explain',
        params: { tld: 'zip' },
      },
    ]);
  });

  it('reports incomplete and skipped parts and still reviews the rest', () => {
    const r = review(
      parts({
        tls: { state: 'incomplete', reason: { code: 'tls.timeout' } },
        dns: {
          state: 'skipped',
          reason: { code: 'security.part-skipped', params: { part: 'dns' } },
        },
      }),
      CATALOG,
    );
    expect(r.parts.tls).toEqual({ state: 'incomplete', reason: { code: 'tls.timeout' } });
    expect(r.parts.dns.state).toBe('skipped');
    expect(r.parts.headers).toEqual({ state: 'complete' });
    expect(r.findings.some((f) => f.tool === 'headers')).toBe(true);
    expect(r.scope.checked).toEqual(['explain', 'inspect', 'headers']);
  });

  it('keeps the findings of the hops seen before a chain timed out (FR-062)', () => {
    const partial = redirects(['https-downgrade']);
    partial.stopReason = 'timeout';
    const r = review(
      parts({
        redirects: { state: 'incomplete', reason: { code: 'inspect.timeout' }, value: partial },
      }),
      CATALOG,
    );
    expect(r.parts.redirects).toEqual({ state: 'incomplete', reason: { code: 'inspect.timeout' } });
    expect(r.findings).toContainEqual({
      code: 'security.hop.https-downgrade',
      severity: 'high',
      tool: 'inspect',
      params: { host: 'bit.example' },
    });
  });

  it('always declares what is not checked', () => {
    expect(review(parts(), CATALOG).scope.notChecked).toEqual(['reputation', 'content']);
  });

  it('has no score, grade, rating or verdict (FR-064)', () => {
    const keys: string[] = [];
    JSON.stringify(review(parts(), CATALOG), (key, value: unknown) => (keys.push(key), value));
    for (const word of ['score', 'grade', 'rating', 'verdict'])
      expect(keys.filter((k) => k.toLowerCase().includes(word))).toEqual([]);
  });

  it('is deterministic', () => {
    expect(review(parts(), CATALOG)).toEqual(review(parts(), CATALOG));
  });
});

describe('securityTool', () => {
  const observation = (url: string): ChainObservation => ({
    chain: {
      input: url,
      hops: [
        { index: 0, url, status: 200, type: 'final', location: null, durationMs: 1, flags: [] },
      ],
      final: url,
      stopReason: 'final',
      totalMs: 1,
    },
    finalResponse: {
      status: 200,
      rawHeaders: [],
      contentType: 'text/html',
      body: null,
      bodyTruncated: false,
    },
  });

  it('runs explain, the chain, then TLS and DNS of the destination, through the adapters', async () => {
    const calls: string[] = [];
    const r = await securityTool.run(
      { url: 'https://www.example.com/' },
      {
        catalog: CATALOG,
        fetchChain: async (url, opts) => (
          calls.push(`chain ${opts.body}`),
          { ok: true, value: observation(url) }
        ),
        probeTls: async (t) => (
          calls.push(`tls ${t.host}`),
          { kind: 'error', code: 'tls.timeout' }
        ),
        queryDns: async (name) => (calls.push(`dns ${name}`), { kind: 'unavailable' }),
      },
    );
    expect(calls).toEqual(['chain none', 'tls www.example.com', 'dns example.com']);
    expect(r).toMatchObject({
      ok: true,
      value: {
        parts: {
          explain: { state: 'complete' },
          redirects: { state: 'complete' },
          headers: { state: 'complete' },
          tls: { state: 'incomplete', reason: { code: 'tls.timeout' } },
          dns: { state: 'incomplete', reason: { code: 'dns.unavailable' } },
        },
      },
    });
  });

  it('opens no connection after a blocked chain, keeping Explain URL and the block finding', async () => {
    let probes = 0;
    const blocked: ChainObservation = {
      chain: {
        input: 'http://user@10.0.0.1/',
        hops: [
          {
            index: 0,
            url: 'http://user@10.0.0.1/',
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
    };
    const r = await securityTool.run(
      { url: 'http://user@10.0.0.1/' },
      {
        catalog: CATALOG,
        fetchChain: async () => ({ ok: true, value: blocked }),
        probeTls: async () => (probes++, { kind: 'error', code: 'tls.timeout' }),
        queryDns: async () => (probes++, { kind: 'unavailable' }),
      },
    );
    expect(probes).toBe(0);
    if (!r.ok) throw new Error('expected ok');
    expect(new Set(r.value.findings.map((f) => f.tool))).toEqual(new Set(['explain', 'inspect']));
    expect(r.value.findings.find((f) => f.tool === 'inspect')?.code).toBe(
      'inspect.blocked.private-address',
    );
    for (const part of ['redirects', 'headers', 'tls', 'dns'] as const)
      expect(r.value.parts[part]).toEqual({
        state: 'skipped',
        reason: { code: 'inspect.blocked.private-address' },
      });
  });

  it('declares its registry entry', () => {
    expect(securityTool).toMatchObject({
      id: 'security',
      runsOn: 'server',
      sendTo: ['explain', 'inspect', 'headers', 'tls', 'dns'],
    });
  });
});
