/**
 * Texts for people, indexed by message code (Principio X). The core and the API return codes;
 * presentation layers look them up here. A text can be rewritten at any time; a code cannot.
 */
import type { MessageRef } from '@urlkit/core';
import en from './en.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };

export type Lang = 'es' | 'en';
export const LANGS: readonly Lang[] = ['es', 'en'];

export type TextKey = keyof typeof es;

const catalogs: Record<Lang, Record<string, string>> = { es, en };

/**
 * Text for a code or MessageRef in the given language, with `{param}` interpolation.
 * Falls back to English, then to the code itself, so a missing text is visible but never fatal.
 * `extra` lets callers supply texts that are not in the catalogs (tests only).
 */
export function t(ref: MessageRef | TextKey, lang: Lang, extra?: Record<string, string>): string;
export function t(
  ref: MessageRef | string,
  lang: Lang,
  extra: Record<string, string> = {},
): string {
  const { code, params = {} } = typeof ref === 'string' ? { code: ref, params: {} } : ref;
  const template = catalogs[lang][code] ?? catalogs.en[code] ?? extra[code] ?? code;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function isLang(value: string | undefined): value is Lang {
  return value === 'es' || value === 'en';
}
