/**
 * Smart Cleaner (FR-010–FR-015). Safe mode applies only catalogued tracking params and redirect
 * wrappers; max mode adds per-site rules (canonical product URLs, functional-looking params).
 * The catalog is injected: the core never imports packages/rules (Principio X).
 */
import type { MessageRef, ParsedUrl, QueryParam, Result } from '../../types.ts';
import { toolError } from '../../types.ts';
import { parseUrl } from '../../url/parse.ts';
import { serializeUrl, toParts } from '../../url/serialize.ts';
import type { RuleCatalog, RuleMode } from './catalog.ts';
import { matchDomainRules, matchParamRule, matchWrapperRules } from './match.ts';

export interface CleanInput {
  url: string;
  mode?: RuleMode;
  /** Param names to keep even if a rule matches them (FR-014). */
  keep?: string[];
}

export interface RemovedItem {
  kind: 'param' | 'wrapper' | 'path';
  name: string;
  value?: string;
  ruleId: string;
  platform?: string;
  reason: MessageRef;
}

export interface CleanResult {
  input: string;
  output: string;
  mode: RuleMode;
  changed: boolean;
  removed: RemovedItem[];
  /** Wrapper URLs that were peeled off, outermost first. */
  unwrapped: string[];
  /** In safe mode, what "limpieza máxima" would add; `null` otherwise or when it adds nothing. */
  maxPreview: { output: string; extra: RemovedItem[] } | null;
  catalogVersion: string;
}

const MAX_WRAPPER_DEPTH = 10;
const HTTP = /^https?:\/\//i;

type Tagged = RemovedItem & { mode: RuleMode };

export function clean(input: CleanInput & { catalog: RuleCatalog }): Result<CleanResult> {
  const { catalog, mode = 'safe' } = input;
  const keep = new Set((input.keep ?? []).map((k) => k.toLowerCase()));

  const parsed = parseUrl(input.url);
  if (!parsed.ok) return parsed;
  if (parsed.value.scheme !== 'http' && parsed.value.scheme !== 'https') {
    return { ok: false, error: toolError('url.unsupported-scheme', 'scheme') };
  }

  const unwrapped: string[] = [];
  const wrappers: Tagged[] = [];
  let current = parsed.value;
  for (let depth = 0; depth < MAX_WRAPPER_DEPTH; depth++) {
    const next = unwrapOnce(current, catalog);
    if (!next) break;
    unwrapped.push(current.href);
    wrappers.push(next.item);
    current = next.url;
  }

  const result = cleanParams(current, catalog, mode, keep);
  if (!result.ok) return result;
  const removed = [...wrappers, ...result.value.removed];

  let maxPreview: CleanResult['maxPreview'] = null;
  if (mode === 'safe') {
    const max = cleanParams(current, catalog, 'max', keep);
    if (!max.ok) return max;
    const extra = max.value.removed.filter((item) => item.mode === 'max');
    if (extra.length > 0) maxPreview = { output: max.value.output, extra: extra.map(untag) };
  }

  return {
    ok: true,
    value: {
      input: input.url,
      output: result.value.output,
      mode,
      changed: removed.length > 0,
      removed: removed.map(untag),
      unwrapped,
      maxPreview,
      catalogVersion: catalog.version,
    },
  };
}

function untag({ mode: _mode, ...item }: Tagged): RemovedItem {
  return item;
}

function unwrapOnce(url: ParsedUrl, catalog: RuleCatalog): { url: ParsedUrl; item: Tagged } | null {
  for (const rule of matchWrapperRules(url.host.ascii, url.path.raw, catalog)) {
    for (const name of rule.params) {
      const value = url.query.find((p) => p.name === name)?.value;
      if (!value || !HTTP.test(value)) continue;
      const inner = parseUrl(value);
      if (!inner.ok || (inner.value.scheme !== 'http' && inner.value.scheme !== 'https')) continue;
      return {
        url: inner.value,
        item: {
          kind: 'wrapper',
          name: url.host.ascii,
          ruleId: rule.id,
          platform: rule.platform,
          reason: { code: rule.reason, params: { platform: rule.platform } },
          mode: rule.mode,
        },
      };
    }
  }
  return null;
}

function cleanParams(
  url: ParsedUrl,
  catalog: RuleCatalog,
  mode: RuleMode,
  keep: Set<string>,
): Result<{ output: string; removed: Tagged[] }> {
  const removed: Tagged[] = [];
  const parts = toParts(url);
  const kept = (param: QueryParam) => keep.has(param.name.toLowerCase());
  const removeParam = (param: QueryParam, meta: Omit<Tagged, 'kind' | 'name' | 'value'>) =>
    removed.push({
      kind: 'param',
      name: param.name,
      ...(param.value === null ? {} : { value: param.value }),
      ...meta,
    });

  let query = url.query.filter((param) => {
    const rule = kept(param) ? null : matchParamRule(param.name, url.registrableDomain, catalog);
    if (!rule || (rule.mode === 'max' && mode === 'safe')) return true;
    removeParam(param, {
      ruleId: rule.id,
      platform: rule.platform,
      reason: { code: rule.reason },
      mode: rule.mode,
    });
    return false;
  });

  if (mode === 'max') {
    for (const rule of matchDomainRules(url.registrableDomain, catalog)) {
      const match = new RegExp(rule.pathPattern).exec(url.path.raw);
      if (!match) continue;
      const meta = {
        ruleId: rule.id,
        platform: rule.platform,
        reason: { code: rule.reason },
        mode: rule.mode,
      };
      const canonical = rule.canonicalPath.replace(
        /\$(\d)/g,
        (_, n: string) => match[Number(n)] ?? '',
      );
      if (canonical !== url.path.raw) {
        removed.push({ kind: 'path', name: url.path.raw, value: canonical, ...meta });
        parts.path = canonical;
      }
      if (rule.query === 'drop') {
        query = query.filter((param) => {
          if (kept(param)) return true;
          removeParam(param, meta);
          return false;
        });
      }
      break;
    }
  }

  // Without params left, the `?` goes too; a URL that had a bare `?` and lost nothing keeps it.
  if (parts.query !== null) {
    const lostParams = removed.some((r) => r.kind === 'param');
    parts.query =
      query.length === 0 && lostParams
        ? null
        : query.map(({ rawName, rawValue }) => ({ rawName, rawValue }));
  }
  const output = serializeUrl(parts);
  if (!output.ok) return output;
  return { ok: true, value: { output: output.value, removed } };
}
