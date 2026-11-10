/**
 * URL Parser (FR-020–FR-022): the ParsedUrl of the core plus edit operations that rebuild the URL
 * with the right encoding. Every edit is validated: an invalid value returns an error naming the
 * part instead of a silently different URL (Principio II).
 */
import type { Schema, ToolDefinition } from '../../registry.ts';
import type { ParsedUrl, Result } from '../../types.ts';
import { toolError } from '../../types.ts';
import { parseUrl } from '../../url/parse.ts';
import {
  encodeQueryComponent,
  serializeUrl,
  toParts,
  type RawParam,
  type UrlParts,
} from '../../url/serialize.ts';
import { decodeFragment, encodeFragment, isRecord } from '../share.ts';

export type EditableComponent =
  'scheme' | 'username' | 'password' | 'host' | 'port' | 'path' | 'fragment';

function rebuild(parts: UrlParts): Result<ParsedUrl> {
  const href = serializeUrl(parts);
  return href.ok ? parseUrl(href.value, { standard: true }) : href;
}

function params(url: ParsedUrl): RawParam[] {
  return url.query.map(({ rawName, rawValue }) => ({ rawName, rawValue }));
}

export function setComponent(
  url: ParsedUrl,
  component: EditableComponent,
  value: string | null,
): Result<ParsedUrl> {
  const parts = toParts(url);
  const text = value ?? '';
  switch (component) {
    case 'scheme':
      parts.scheme = text.toLowerCase();
      break;
    case 'username':
      parts.username = encodeURIComponent(text);
      break;
    case 'password':
      parts.password = encodeURIComponent(text);
      break;
    case 'host':
      if (text === '' || /[\s/?#@]/.test(text))
        return { ok: false, error: toolError('url.invalid', 'host') };
      parts.host = text;
      break;
    case 'port':
      if (!/^\d{0,5}$/.test(text) || Number(text) > 65_535)
        return { ok: false, error: toolError('url.invalid', 'port') };
      parts.port = text === '' ? null : Number(text);
      break;
    case 'path':
      parts.path = text.startsWith('/') || !parts.hasAuthority ? text : `/${text}`;
      break;
    case 'fragment':
      parts.fragment = value;
      break;
  }
  return rebuild(parts);
}

export function setParam(
  url: ParsedUrl,
  index: number,
  change: { name?: string; value?: string | null },
): Result<ParsedUrl> {
  const list = params(url);
  const current = list[index];
  if (!current) return { ok: false, error: toolError('url.invalid', 'query') };
  if (change.name !== undefined) current.rawName = encodeQueryComponent(change.name);
  if (change.value !== undefined)
    current.rawValue = change.value === null ? null : encodeQueryComponent(change.value);
  return rebuild({ ...toParts(url), query: list });
}

export function addParam(url: ParsedUrl, name: string, value: string | null): Result<ParsedUrl> {
  const list = [
    ...params(url),
    {
      rawName: encodeQueryComponent(name),
      rawValue: value === null ? null : encodeQueryComponent(value),
    },
  ];
  return rebuild({ ...toParts(url), query: list });
}

export function removeParam(url: ParsedUrl, index: number): Result<ParsedUrl> {
  const list = params(url);
  if (!list[index]) return { ok: false, error: toolError('url.invalid', 'query') };
  list.splice(index, 1);
  return rebuild({ ...toParts(url), query: list.length ? list : null });
}

export function moveParam(url: ParsedUrl, from: number, to: number): Result<ParsedUrl> {
  const list = params(url);
  const [moved] = list.splice(from, 1);
  if (!moved || to < 0 || to > list.length)
    return { ok: false, error: toolError('url.invalid', 'query') };
  list.splice(to, 0, moved);
  return rebuild({ ...toParts(url), query: list });
}

const input: Schema<{ url: string }> = {
  safeParse: (data) =>
    isRecord(data) && typeof data.url === 'string'
      ? { success: true, data: { url: data.url } }
      : { success: false },
};

const output: Schema<ParsedUrl> = {
  safeParse: (data) =>
    isRecord(data) && typeof data.href === 'string'
      ? { success: true, data: data as unknown as ParsedUrl }
      : { success: false },
};

export const parseTool: ToolDefinition<{ url: string }, ParsedUrl> = {
  id: 'parse',
  version: '1.0.0',
  runsOn: 'client',
  input,
  output,
  run: ({ url }) => parseUrl(url),
  sendTo: ['clean', 'explain', 'diff', 'inspect'],
  share: {
    encode: ({ url }) => encodeFragment([['u', url]]),
    decode(fragment) {
      const url = decodeFragment(fragment).get('u');
      return url ? { url } : null;
    },
  },
};
