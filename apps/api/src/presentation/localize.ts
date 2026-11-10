/**
 * The only module of the API allowed to import packages/i18n (plan.md, invariant 1).
 * Resolves the optional `?lang` parameter: every MessageRef keeps its `code` and gains `text`.
 * Text is an addition, never a replacement. It is a catalog lookup, not text composition.
 */
import { isMessageCode } from '@urlkit/core';
import { t, type Lang } from '@urlkit/i18n';

export function localize<T>(value: T, lang: Lang | undefined): T {
  if (lang === undefined) return value;
  return walk(value, lang) as T;
}

function walk(value: unknown, lang: Lang): unknown {
  if (Array.isArray(value)) return value.map((item) => walk(item, lang));
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) out[key] = walk(child, lang);
  const code = (value as { code?: unknown }).code;
  if (typeof code === 'string' && isMessageCode(code)) {
    const params = (value as { params?: Record<string, string | number> }).params;
    out.text = t({ code, ...(params ? { params } : {}) }, lang);
  }
  return out;
}
