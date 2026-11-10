/**
 * Rebuilds a URL from its components. Unedited parts keep their exact encoding, so
 * `serializeUrl(toParts(parseUrl(x)))` returns the same href (round-trip, Principio II).
 */
import type { ParsedUrl, Result } from '../types.ts';
import { toolError } from '../types.ts';
import { SPECIAL_SCHEMES } from './raw.ts';

export interface RawParam {
  rawName: string;
  rawValue: string | null;
}

export interface UrlParts {
  scheme: string;
  /** Whether the URL has an authority (`//`), even with an empty host (`file:///x`). */
  hasAuthority: boolean;
  username: string;
  password: string;
  /** ASCII host. */
  host: string;
  /** Explicit port, `null` for none or the default. */
  port: number | null;
  path: string;
  /** `null` = no `?`; `[]` = a bare `?`. */
  query: RawParam[] | null;
  fragment: string | null;
}

export function toParts(url: ParsedUrl): UrlParts {
  const beforeFragment =
    url.fragment === null ? url.href : url.href.slice(0, url.href.lastIndexOf('#'));
  return {
    scheme: url.scheme,
    hasAuthority: url.href.startsWith(`${url.scheme}://`),
    username: url.username,
    password: url.password,
    host: url.host.ascii,
    port: url.port.isDefault ? null : url.port.value,
    path: url.path.raw,
    query: beforeFragment.includes('?')
      ? url.query.map(({ rawName, rawValue }) => ({ rawName, rawValue }))
      : null,
    fragment: url.fragment,
  };
}

/** Builds the string without validating it. */
export function buildUrl(parts: UrlParts): string {
  let out = `${parts.scheme}:`;
  const authority = parts.hasAuthority || parts.host !== '' || SPECIAL_SCHEMES.has(parts.scheme);
  if (authority) {
    out += '//';
    if (parts.username !== '' || parts.password !== '') {
      out += parts.username + (parts.password === '' ? '' : `:${parts.password}`) + '@';
    }
    out += parts.host + (parts.port === null ? '' : `:${parts.port}`);
  } else if (parts.path.startsWith('//')) {
    out += '/.'; // keeps an empty-host path from being read as an authority (WHATWG serialiser)
  }
  out += parts.path;
  if (parts.query !== null) {
    out +=
      '?' +
      parts.query
        .map((p) => (p.rawValue === null ? p.rawName : `${p.rawName}=${p.rawValue}`))
        .join('&');
  }
  if (parts.fragment !== null) out += `#${parts.fragment}`;
  return out;
}

/** Builds and validates a URL; returns the WHATWG href or an explicit error naming the part. */
export function serializeUrl(parts: UrlParts): Result<string> {
  if (
    parts.port !== null &&
    (!Number.isInteger(parts.port) || parts.port < 0 || parts.port > 65_535)
  ) {
    return { ok: false, error: toolError('url.invalid', 'port') };
  }
  if (!/^[A-Za-z][A-Za-z0-9+.-]*$/.test(parts.scheme)) {
    return { ok: false, error: toolError('url.invalid', 'scheme') };
  }
  try {
    return { ok: true, value: new URL(buildUrl(parts)).href };
  } catch {
    return { ok: false, error: toolError('url.invalid', parts.host === '' ? 'url' : 'host') };
  }
}

/** Encoding for an edited query name or value. */
export function encodeQueryComponent(value: string): string {
  return encodeURIComponent(value);
}
