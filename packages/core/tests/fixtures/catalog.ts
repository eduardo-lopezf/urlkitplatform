/** Synthetic catalogs written for each test: the core never imports the real one. */
import type { DomainRule, ParamRule, RuleCatalog, WrapperRule } from '../../src/index.ts';

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
