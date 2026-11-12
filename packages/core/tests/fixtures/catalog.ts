/** Synthetic catalogs written for each test: the core never imports the real one. */
import type {
  DomainRule,
  ParamRule,
  RuleCatalog,
  SecurityCriteria,
  WrapperRule,
} from '../../src/index.ts';

export function param(id: string, overrides: Partial<ParamRule> = {}): ParamRule {
  return {
    id,
    kind: 'tracking-param',
    mode: 'safe',
    platform: 'Test',
    reason: 'clean.reason.campaign',
    domains: null,
    exceptions: [],
    ...overrides,
  };
}

export function wrapper(id: string, overrides: Partial<WrapperRule> = {}): WrapperRule {
  return {
    id,
    kind: 'wrapper',
    mode: 'safe',
    platform: 'Search',
    reason: 'clean.reason.wrapper',
    subdomains: false,
    path: '/url',
    params: ['q', 'url'],
    ...overrides,
  };
}

export function domainRule(id: string, overrides: Partial<DomainRule> = {}): DomainRule {
  return {
    id,
    kind: 'domain-rule',
    mode: 'max',
    platform: 'Store',
    reason: 'clean.reason.canonical',
    pathPattern: '^/(?:[^/]+/)?dp/([A-Z0-9]{10})',
    canonicalPath: '/dp/$1',
    query: 'drop',
    ...overrides,
  };
}

export function catalog(parts: Partial<RuleCatalog> = {}): RuleCatalog {
  return {
    version: '0.0.0-test',
    exact: {},
    prefixes: [],
    wrappers: {},
    domains: {},
    abuseTlds: [],
    ...parts,
  };
}

/** Synthetic v2 criteria (002 research R8). Values are deliberately not the real ones. */
export function criteria(overrides: Partial<SecurityCriteria> = {}): SecurityCriteria {
  return {
    headers: {
      hsts: { minMaxAge: 1000 },
      csp: { unsafeScriptSources: ["'unsafe-inline'", "'unsafe-eval'", '*', 'data:'] },
      frameOptions: { valid: ['DENY', 'SAMEORIGIN'] },
      referrerPolicy: {
        valid: ['no-referrer', 'strict-origin-when-cross-origin', 'unsafe-url'],
        unsafe: ['unsafe-url'],
      },
    },
    tls: { expiringSoonDays: 10, weakSignatures: ['sha1'], legacyProtocols: ['TLSv1.1'] },
    severities: {},
    ...overrides,
  };
}
