/** Catalog lookups shared by Smart Cleaner, URL Diff (ignoreTracking) and Explain URL. */
import type { DomainRule, ParamRule, RuleCatalog, WrapperRule } from './catalog.ts';

function own<T>(record: Record<string, T[]>, key: string): T[] {
  return Object.hasOwn(record, key) ? (record[key] ?? []) : [];
}

/** The tracking rule that applies to a param on a site, or `null`. Safe rules win over max. */
export function matchParamRule(
  name: string,
  registrableDomain: string | null,
  catalog: RuleCatalog,
): ParamRule | null {
  const lower = name.toLowerCase();
  const candidates = [
    ...own(catalog.exact, lower),
    ...catalog.prefixes.filter((p) => lower.startsWith(p.prefix)).map((p) => p.rule),
  ].filter(
    (rule) =>
      (rule.domains === null ||
        (registrableDomain !== null && rule.domains.includes(registrableDomain))) &&
      !(registrableDomain !== null && rule.exceptions.includes(registrableDomain)),
  );
  return candidates.find((r) => r.mode === 'safe') ?? candidates[0] ?? null;
}

export function matchWrapperRules(host: string, path: string, catalog: RuleCatalog): WrapperRule[] {
  const rules: WrapperRule[] = [];
  let candidate = host.toLowerCase();
  for (;;) {
    for (const rule of own(catalog.wrappers, candidate)) {
      if (candidate !== host.toLowerCase() && !rule.subdomains) continue;
      const matches = rule.path.endsWith('*')
        ? path.startsWith(rule.path.slice(0, -1))
        : path === rule.path;
      if (matches) rules.push(rule);
    }
    const dot = candidate.indexOf('.');
    if (dot < 0) return rules;
    candidate = candidate.slice(dot + 1);
  }
}

export function matchDomainRules(
  registrableDomain: string | null,
  catalog: RuleCatalog,
): DomainRule[] {
  return registrableDomain === null ? [] : own(catalog.domains, registrableDomain);
}
