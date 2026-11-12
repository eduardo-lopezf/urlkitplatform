/**
 * HTTP Headers evaluation (002/T030, research R3). Pure: it receives what the chain probe saw and
 * the injected criteria, and decides which security headers are present, missing or
 * misconfigured. Header parsing lives here, never in the probe or the route (Principio VIII).
 * Cookie values are dropped on reading and never reach the result (Principio V).
 */
import type { MessageRef } from '../../types.ts';
import type { HeaderCriteria, RuleCatalog } from '../clean/catalog.ts';
import type { StopReason } from '../inspect/types.ts';
import type { ChainObservation } from './types.ts';

export type HeaderState = 'present' | 'missing' | 'misconfigured' | 'not-applicable';

export interface HeaderCheck {
  header: string;
  state: HeaderState;
  findings: MessageRef[];
}

export interface CookieCheck {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none' | null;
  findings: MessageRef[];
}

export interface HeadersAnalysis {
  input: string;
  finalUrl: string | null;
  /** Redirects followed before the final response. */
  hops: number;
  stopReason: StopReason;
  status: number | null;
  /** In received order, repetitions kept. `Set-Cookie` values are replaced by `<omitido>`. */
  headers: Array<{ name: string; value: string }>;
  security: HeaderCheck[];
  cookies: CookieCheck[];
  error?: MessageRef;
  catalogVersion: string;
}

/** What replaces a cookie value in the headers list. */
export const OMITTED = '<omitido>';

export function analyzeHeaders(
  observation: ChainObservation,
  catalog: RuleCatalog,
): HeadersAnalysis {
  const criteria = catalog.security?.headers;
  if (!criteria) throw new Error('headers needs the security criteria of the catalog');
  const { chain, finalResponse } = observation;
  const base = {
    input: chain.input,
    finalUrl: chain.final,
    hops: Math.max(0, chain.hops.length - 1),
    stopReason: chain.stopReason,
    catalogVersion: catalog.version,
  };

  if (chain.stopReason !== 'final' || !finalResponse) {
    const error = chain.hops.at(-1)?.error;
    return {
      ...base,
      status: null,
      headers: [],
      security: [],
      cookies: [],
      ...(error ? { error } : {}),
    };
  }

  const raw = finalResponse.rawHeaders;
  const https = (chain.final ?? '').startsWith('https:');
  const values = (name: string) => raw.filter(([n]) => n.toLowerCase() === name).map(([, v]) => v);

  const csp = values('content-security-policy').flatMap(splitPolicies);
  return {
    ...base,
    status: finalResponse.status,
    headers: raw.map(([name, value]) => ({
      name,
      value: name.toLowerCase() === 'set-cookie' ? OMITTED : value,
    })),
    security: [
      hsts(values('strict-transport-security'), https, criteria),
      contentSecurityPolicy(csp, values('content-security-policy-report-only'), criteria),
      noSniff(values('x-content-type-options')),
      framing(csp, values('x-frame-options'), criteria),
      referrer(values('referrer-policy'), criteria),
      presence('permissions-policy', values('permissions-policy'), 'headers.permissions.missing'),
    ],
    cookies: values('set-cookie').map((value) => cookie(value, https)),
  };
}

const check = (header: string, state: HeaderState, findings: MessageRef[] = []): HeaderCheck => ({
  header,
  state,
  findings,
});

function presence(header: string, found: string[], missing: MessageRef['code']): HeaderCheck {
  return found.length > 0
    ? check(header, 'present')
    : check(header, 'missing', [{ code: missing }]);
}

/** HSTS: browsers honour the first header and ignore it entirely over http. */
function hsts(found: string[], https: boolean, criteria: HeaderCriteria): HeaderCheck {
  const header = 'strict-transport-security';
  if (!https) return check(header, 'not-applicable');
  const first = found[0];
  if (first === undefined) return check(header, 'missing', [{ code: 'headers.hsts.missing' }]);
  const directive = first
    .split(';')
    .map((d) => d.trim())
    .find((d) => /^max-age\s*=/i.test(d));
  const value =
    directive
      ?.split('=')[1]
      ?.trim()
      .replace(/^"(.*)"$/, '$1') ?? '';
  if (!/^\d+$/.test(value))
    return check(header, 'misconfigured', [{ code: 'headers.hsts.invalid' }]);
  const maxAge = Number(value);
  const min = criteria.hsts.minMaxAge;
  return maxAge < min
    ? check(header, 'misconfigured', [
        { code: 'headers.hsts.short-max-age', params: { maxAge, min } },
      ])
    : check(header, 'present');
}

type Policy = Map<string, string[]>;

/** One header can carry several policies separated by commas; each is enforced on its own. */
function splitPolicies(value: string): Policy[] {
  return value.split(',').map((text) => {
    const policy: Policy = new Map();
    for (const part of text.split(';')) {
      const [name, ...sources] = part.trim().split(/\s+/);
      if (!name) continue;
      const key = name.toLowerCase();
      if (!policy.has(key)) policy.set(key, sources); // the first occurrence wins
    }
    return policy;
  });
}

/** Unsafe sources a policy lets scripts use, in the order they appear. */
function unsafeScriptSources(policy: Policy, criteria: HeaderCriteria): MessageRef[] | null {
  const sources = policy.get('script-src') ?? policy.get('default-src');
  if (!sources) return null; // no script restriction at all
  const lower = sources.map((s) => s.toLowerCase());
  // CSP Level 3: 'unsafe-inline' is ignored when a nonce or a hash is present.
  const hasNonceOrHash = lower.some((s) => /^'(nonce-|sha(256|384|512)-)/.test(s));
  // CSP Level 3: with 'strict-dynamic', host and scheme sources (the unquoted ones: `*`,
  // `https:`, `data:`, hosts) and 'unsafe-inline' are ignored. 'unsafe-eval' still applies.
  const strictDynamic = lower.includes("'strict-dynamic'");
  const unsafe = new Set(criteria.csp.unsafeScriptSources.map((s) => s.toLowerCase()));
  const findings: MessageRef[] = [];
  for (const source of lower) {
    if (!unsafe.has(source)) continue;
    if (strictDynamic && !source.startsWith("'")) continue;
    if (source === "'unsafe-inline'") {
      if (!hasNonceOrHash && !strictDynamic) findings.push({ code: 'headers.csp.unsafe-inline' });
    } else if (source === "'unsafe-eval'") findings.push({ code: 'headers.csp.unsafe-eval' });
    else findings.push({ code: 'headers.csp.unsafe-source', params: { source } });
  }
  return findings;
}

function contentSecurityPolicy(
  policies: Policy[],
  reportOnly: string[],
  criteria: HeaderCriteria,
): HeaderCheck {
  const header = 'content-security-policy';
  if (policies.length === 0) {
    const findings: MessageRef[] = [{ code: 'headers.csp.missing' }];
    if (reportOnly.length > 0) findings.push({ code: 'headers.csp.report-only' });
    return check(header, 'missing', findings);
  }
  const restricting = policies
    .map((p) => unsafeScriptSources(p, criteria))
    .filter((f): f is MessageRef[] => f !== null);
  if (restricting.length === 0)
    return check(header, 'misconfigured', [{ code: 'headers.csp.no-script-restriction' }]);
  // A script runs only if every policy allows it, so a source is unsafe only if all allow it.
  const key = (f: MessageRef) => `${f.code}|${String(f.params?.source ?? '')}`;
  const [first = [], ...rest] = restricting;
  const findings = first.filter((f) => rest.every((other) => other.some((o) => key(o) === key(f))));
  return findings.length > 0 ? check(header, 'misconfigured', findings) : check(header, 'present');
}

function noSniff(found: string[]): HeaderCheck {
  const header = 'x-content-type-options';
  const first = found[0];
  if (first === undefined) return check(header, 'missing', [{ code: 'headers.nosniff.missing' }]);
  return first.trim().toLowerCase() === 'nosniff'
    ? check(header, 'present')
    : check(header, 'misconfigured', [{ code: 'headers.nosniff.invalid' }]);
}

/** `frame-ancestors` in any enforced policy protects on its own; otherwise X-Frame-Options. */
function framing(policies: Policy[], found: string[], criteria: HeaderCriteria): HeaderCheck {
  const header = 'x-frame-options';
  if (policies.some((p) => p.has('frame-ancestors'))) return check(header, 'present');
  if (found.length === 0) return check(header, 'missing', [{ code: 'headers.framing.missing' }]);
  // HTML Standard: the header (or several) is read as one list; if every value is the same
  // (case-insensitively) it counts as that value, otherwise the header is invalid.
  const values = new Set(
    found
      .flatMap((v) => v.split(','))
      .map((v) => v.trim().toUpperCase())
      .filter((v) => v !== ''),
  );
  const [value] = [...values];
  const valid = criteria.frameOptions.valid.map((v) => v.toUpperCase());
  return values.size === 1 && value !== undefined && valid.includes(value)
    ? check(header, 'present')
    : check(header, 'misconfigured', [{ code: 'headers.framing.invalid' }]);
}

/** Browsers use the last token they recognise, across every Referrer-Policy header. */
function referrer(found: string[], criteria: HeaderCriteria): HeaderCheck {
  const header = 'referrer-policy';
  if (found.length === 0) return check(header, 'missing', [{ code: 'headers.referrer.missing' }]);
  const valid = new Set(criteria.referrerPolicy.valid);
  const tokens = found.flatMap((v) => v.split(',')).map((t) => t.trim().toLowerCase());
  const effective = tokens.filter((t) => valid.has(t)).at(-1);
  if (effective === undefined)
    return check(header, 'misconfigured', [{ code: 'headers.referrer.invalid' }]);
  return criteria.referrerPolicy.unsafe.includes(effective)
    ? check(header, 'misconfigured', [{ code: 'headers.referrer.unsafe-url' }])
    : check(header, 'present');
}

/** Reads name and attributes; the value is discarded here and never stored. */
function cookie(header: string, https: boolean): CookieCheck {
  const [pair = '', ...attributes] = header.split(';');
  const eq = pair.indexOf('=');
  const name = (eq === -1 ? '' : pair.slice(0, eq)).trim();
  const attrs = attributes.map((a) => {
    const i = a.indexOf('=');
    return {
      key: (i === -1 ? a : a.slice(0, i)).trim().toLowerCase(),
      value:
        i === -1
          ? ''
          : a
              .slice(i + 1)
              .trim()
              .toLowerCase(),
    };
  });
  const secure = attrs.some((a) => a.key === 'secure');
  const httpOnly = attrs.some((a) => a.key === 'httponly');
  const raw = attrs.find((a) => a.key === 'samesite')?.value;
  const sameSite = raw === 'strict' || raw === 'lax' || raw === 'none' ? raw : null;

  const findings: MessageRef[] = [];
  const params = { name };
  if (https && !secure) findings.push({ code: 'headers.cookie.not-secure', params });
  if (!httpOnly) findings.push({ code: 'headers.cookie.not-httponly', params });
  if (sameSite === 'none' && !secure)
    findings.push({ code: 'headers.cookie.samesite-none-insecure', params });
  return { name, secure, httpOnly, sameSite, findings };
}
