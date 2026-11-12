/** HTTP Headers: evaluation of a synthetic chain observation (002/T025). */
import { describe, expect, it } from 'vitest';
import {
  analyzeHeaders,
  headersTool,
  type ChainObservation,
  type HeadersAnalysis,
  type RedirectChain,
} from '../../src/index.ts';
import { catalog, criteria } from '../fixtures/catalog.ts';

const CATALOG = catalog({ version: '9.8.7-test', security: criteria() });

function chain(urls: string[], stopReason: RedirectChain['stopReason'] = 'final'): RedirectChain {
  return {
    input: urls[0] ?? '',
    hops: urls.map((url, index) => ({
      index,
      url,
      status: index === urls.length - 1 ? 200 : 301,
      type: index === urls.length - 1 ? 'final' : 'permanent',
      location: null,
      durationMs: 1,
      flags: [],
    })),
    final: stopReason === 'final' ? (urls.at(-1) ?? null) : null,
    stopReason,
    totalMs: urls.length,
  };
}

function observe(
  headers: Array<[string, string]>,
  url = 'https://example.com/',
  extra: Partial<ChainObservation> = {},
): ChainObservation {
  return {
    chain: chain([url]),
    finalResponse: {
      status: 200,
      rawHeaders: headers,
      contentType: 'text/html',
      body: null,
      bodyTruncated: false,
    },
    ...extra,
  };
}

const run = (headers: Array<[string, string]>, url?: string) =>
  analyzeHeaders(observe(headers, url), CATALOG);

const check = (result: HeadersAnalysis, header: string) =>
  result.security.find((c) => c.header === header);
const codes = (result: HeadersAnalysis, header: string) =>
  check(result, header)?.findings.map((f) => f.code) ?? [];

const SAFE: Array<[string, string]> = [
  ['Strict-Transport-Security', 'max-age=2000; includeSubDomains'],
  ['Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'"],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=()'],
];

describe('headers list', () => {
  it('keeps received order and repetitions', () => {
    const r = run([
      ['X-A', '1'],
      ['x-b', '2'],
      ['X-A', '3'],
    ]);
    expect(r.headers).toEqual([
      { name: 'X-A', value: '1' },
      { name: 'x-b', value: '2' },
      { name: 'X-A', value: '3' },
    ]);
  });

  it('never returns a cookie value', () => {
    const r = run([
      ['Set-Cookie', 'session=SECRET-VALUE-123; Secure; HttpOnly'],
      ['set-cookie', 'pref=OTHER-SECRET'],
    ]);
    expect(r.headers).toEqual([
      { name: 'Set-Cookie', value: '<omitido>' },
      { name: 'set-cookie', value: '<omitido>' },
    ]);
    const json = JSON.stringify(r);
    expect(json).not.toContain('SECRET-VALUE-123');
    expect(json).not.toContain('OTHER-SECRET');
  });
});

describe('security headers', () => {
  it('evaluates every header of the catalog, in a fixed order', () => {
    expect(run(SAFE).security.map((c) => c.header)).toEqual([
      'strict-transport-security',
      'content-security-policy',
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'permissions-policy',
    ]);
    expect(run(SAFE).security.every((c) => c.state === 'present' && c.findings.length === 0)).toBe(
      true,
    );
  });

  it('HSTS: missing, short max-age, invalid and not applicable on http', () => {
    expect(check(run([]), 'strict-transport-security')).toMatchObject({
      state: 'missing',
      findings: [{ code: 'headers.hsts.missing' }],
    });
    expect(
      check(run([['Strict-Transport-Security', 'max-age=10']]), 'strict-transport-security'),
    ).toMatchObject({
      state: 'misconfigured',
      findings: [{ code: 'headers.hsts.short-max-age', params: { maxAge: 10, min: 1000 } }],
    });
    expect(
      codes(run([['Strict-Transport-Security', 'includeSubDomains']]), 'strict-transport-security'),
    ).toEqual(['headers.hsts.invalid']);
    expect(check(run([], 'http://example.com/'), 'strict-transport-security')).toMatchObject({
      state: 'not-applicable',
      findings: [],
    });
  });

  it("CSP: 'unsafe-inline' in script-src, or in default-src without script-src", () => {
    expect(
      codes(
        run([['Content-Security-Policy', "script-src 'self' 'unsafe-inline'"]]),
        'content-security-policy',
      ),
    ).toEqual(['headers.csp.unsafe-inline']);
    expect(
      check(
        run([['Content-Security-Policy', "default-src 'unsafe-inline'"]]),
        'content-security-policy',
      )?.state,
    ).toBe('misconfigured');
    // script-src takes over default-src
    expect(
      check(
        run([['Content-Security-Policy', "default-src 'unsafe-inline'; script-src 'self'"]]),
        'content-security-policy',
      )?.state,
    ).toBe('present');
  });

  it("CSP: 'unsafe-inline' is ignored next to a nonce or a hash", () => {
    const r = run([['Content-Security-Policy', "script-src 'nonce-abc' 'unsafe-inline'"]]);
    expect(check(r, 'content-security-policy')?.state).toBe('present');
  });

  it('CSP: unsafe sources, eval and no script restriction', () => {
    expect(
      codes(
        run([['Content-Security-Policy', "script-src * 'unsafe-eval'"]]),
        'content-security-policy',
      ),
    ).toEqual(['headers.csp.unsafe-source', 'headers.csp.unsafe-eval']);
    expect(
      codes(run([['Content-Security-Policy', "img-src 'self'"]]), 'content-security-policy'),
    ).toEqual(['headers.csp.no-script-restriction']);
  });

  it('CSP: report-only alone does not protect', () => {
    const r = run([['Content-Security-Policy-Report-Only', "default-src 'self'"]]);
    expect(check(r, 'content-security-policy')).toMatchObject({
      state: 'missing',
      findings: [{ code: 'headers.csp.missing' }, { code: 'headers.csp.report-only' }],
    });
  });

  it('CSP: with several policies, a source is unsafe only if every policy allows it', () => {
    const r = run([
      ['Content-Security-Policy', "script-src 'unsafe-inline'"],
      ['Content-Security-Policy', "script-src 'self'"],
    ]);
    expect(check(r, 'content-security-policy')?.state).toBe('present');
  });

  it('framing: frame-ancestors satisfies it; an invalid X-Frame-Options is misconfigured', () => {
    expect(
      check(run([['Content-Security-Policy', "frame-ancestors 'self'"]]), 'x-frame-options')?.state,
    ).toBe('present');
    expect(check(run([['X-Frame-Options', 'sameorigin']]), 'x-frame-options')?.state).toBe(
      'present',
    );
    expect(check(run([['X-Frame-Options', 'ALLOWALL']]), 'x-frame-options')).toMatchObject({
      state: 'misconfigured',
      findings: [{ code: 'headers.framing.invalid' }],
    });
    expect(codes(run([]), 'x-frame-options')).toEqual(['headers.framing.missing']);
  });

  // Found reviewing SC-003 (eff.org): the HTML standard treats a list of identical values as that value.
  it('framing: repeated identical X-Frame-Options values count as one', () => {
    expect(
      check(run([['X-Frame-Options', 'SAMEORIGIN, SAMEORIGIN']]), 'x-frame-options')?.state,
    ).toBe('present');
    expect(
      check(
        run([
          ['X-Frame-Options', 'deny'],
          ['X-Frame-Options', 'DENY'],
        ]),
        'x-frame-options',
      )?.state,
    ).toBe('present');
    expect(check(run([['X-Frame-Options', 'DENY, SAMEORIGIN']]), 'x-frame-options')).toMatchObject({
      state: 'misconfigured',
      findings: [{ code: 'headers.framing.invalid' }],
    });
    expect(check(run([['X-Frame-Options', ' , ']]), 'x-frame-options')?.state).toBe(
      'misconfigured',
    );
  });

  // Found reviewing SC-003 (youtube.com): CSP Level 3, 'strict-dynamic'.
  it("CSP: 'strict-dynamic' makes host and scheme sources irrelevant, not 'unsafe-eval'", () => {
    const r = run([
      [
        'Content-Security-Policy',
        "script-src 'nonce-abc' 'unsafe-inline' 'strict-dynamic' https: http: * data: 'unsafe-eval'",
      ],
    ]);
    expect(codes(r, 'content-security-policy')).toEqual(['headers.csp.unsafe-eval']);
    expect(
      check(
        run([['Content-Security-Policy', "script-src 'strict-dynamic' 'nonce-abc' http: *"]]),
        'content-security-policy',
      )?.state,
    ).toBe('present');
    // Without 'strict-dynamic' the same sources are still unsafe.
    expect(
      codes(
        run([['Content-Security-Policy', "script-src 'nonce-abc' *"]]),
        'content-security-policy',
      ),
    ).toEqual(['headers.csp.unsafe-source']);
  });

  it('X-Content-Type-Options other than nosniff', () => {
    expect(codes(run([['X-Content-Type-Options', 'sniff']]), 'x-content-type-options')).toEqual([
      'headers.nosniff.invalid',
    ]);
    expect(codes(run([]), 'x-content-type-options')).toEqual(['headers.nosniff.missing']);
  });

  it('Referrer-Policy: the last valid token wins; unsafe-url is misconfigured', () => {
    expect(codes(run([['Referrer-Policy', 'unsafe-url']]), 'referrer-policy')).toEqual([
      'headers.referrer.unsafe-url',
    ]);
    expect(
      check(run([['Referrer-Policy', 'unsafe-url, no-referrer']]), 'referrer-policy')?.state,
    ).toBe('present');
    expect(codes(run([['Referrer-Policy', 'whatever']]), 'referrer-policy')).toEqual([
      'headers.referrer.invalid',
    ]);
    expect(codes(run([]), 'referrer-policy')).toEqual(['headers.referrer.missing']);
  });

  it('Permissions-Policy missing', () => {
    expect(codes(run([]), 'permissions-policy')).toEqual(['headers.permissions.missing']);
  });
});

describe('cookies', () => {
  it('evaluates attributes per cookie, by name only', () => {
    const r = run([
      ['Set-Cookie', 'session=abc; Path=/; Secure; HttpOnly; SameSite=Lax'],
      ['Set-Cookie', 'tracker=xyz; SameSite=None'],
      ['Set-Cookie', 'flag=1; SameSite=Weird'],
    ]);
    expect(r.cookies).toEqual([
      { name: 'session', secure: true, httpOnly: true, sameSite: 'lax', findings: [] },
      {
        name: 'tracker',
        secure: false,
        httpOnly: false,
        sameSite: 'none',
        findings: [
          { code: 'headers.cookie.not-secure', params: { name: 'tracker' } },
          { code: 'headers.cookie.not-httponly', params: { name: 'tracker' } },
          { code: 'headers.cookie.samesite-none-insecure', params: { name: 'tracker' } },
        ],
      },
      {
        name: 'flag',
        secure: false,
        httpOnly: false,
        sameSite: null,
        findings: [
          { code: 'headers.cookie.not-secure', params: { name: 'flag' } },
          { code: 'headers.cookie.not-httponly', params: { name: 'flag' } },
        ],
      },
    ]);
  });

  it('does not ask for Secure on an http page', () => {
    const r = run([['Set-Cookie', 'a=1; HttpOnly']], 'http://example.com/');
    expect(r.cookies[0]?.findings).toEqual([]);
  });
});

describe('chain', () => {
  it('copies hops and the final URL', () => {
    const obs = observe(SAFE);
    obs.chain = chain(['https://short.test/x', 'https://mid.test/', 'https://example.com/']);
    const r = analyzeHeaders(obs, CATALOG);
    expect(r).toMatchObject({
      input: 'https://short.test/x',
      finalUrl: 'https://example.com/',
      hops: 2,
      stopReason: 'final',
      status: 200,
    });
  });

  it('gives empty headers and the hop error when the chain did not end on a response', () => {
    const blocked = chain(['https://intranet.test/'], 'blocked');
    blocked.hops[0] = {
      ...blocked.hops[0]!,
      status: null,
      error: { code: 'inspect.blocked.private-address' },
    };
    const r = analyzeHeaders({ chain: blocked, finalResponse: null }, CATALOG);
    expect(r).toMatchObject({
      finalUrl: null,
      stopReason: 'blocked',
      status: null,
      headers: [],
      security: [],
      cookies: [],
      error: { code: 'inspect.blocked.private-address' },
    });
  });

  it('reports a TLS failure as inspect.tls', () => {
    const tls = chain(['https://self-signed.test/'], 'error');
    tls.hops[0] = { ...tls.hops[0]!, status: null, error: { code: 'inspect.tls' } };
    expect(analyzeHeaders({ chain: tls, finalResponse: null }, CATALOG).error).toEqual({
      code: 'inspect.tls',
    });
  });
});

describe('determinism and catalog', () => {
  it('gives the same result for the same input and echoes catalogVersion', () => {
    const a = run(SAFE);
    expect(run(SAFE)).toEqual(a);
    expect(a.catalogVersion).toBe('9.8.7-test');
  });

  it('takes thresholds from the injected catalog', () => {
    const strict = catalog({
      security: criteria({ headers: { ...criteria().headers, hsts: { minMaxAge: 5000 } } }),
    });
    const r = analyzeHeaders(observe(SAFE), strict);
    expect(codes(r, 'strict-transport-security')).toEqual(['headers.hsts.short-max-age']);
  });
});

describe('headersTool', () => {
  it('runs the chain without body and evaluates it', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const r = await headersTool.run(
      { url: 'https://example.com/' },
      {
        catalog: CATALOG,
        fetchChain: async (url, opts) => {
          calls.push({ url, body: opts.body });
          return { ok: true, value: observe(SAFE, url) };
        },
      },
    );
    expect(calls).toEqual([{ url: 'https://example.com/', body: 'none' }]);
    expect(r).toMatchObject({ ok: true, value: { status: 200 } });
  });

  it('declares its registry entry', () => {
    expect(headersTool).toMatchObject({
      id: 'headers',
      runsOn: 'server',
      sendTo: ['tls', 'inspect', 'security', 'explain'],
    });
    expect(
      headersTool.share.decode(headersTool.share.encode({ url: 'https://a.test/?x=1' })),
    ).toEqual({ url: 'https://a.test/?x=1' });
  });
});
