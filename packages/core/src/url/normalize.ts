/**
 * Normalisation helpers for comparisons (URL Diff, loop detection). They never change what a URL
 * points to: case of the host, default port, equivalent percent-encoding and trailing slash.
 */
import { normalizePercentEncoding } from './encoding.ts';
import { DEFAULT_PORTS } from './parse.ts';

export { normalizePercentEncoding };

/** Lower-cased ASCII (Punycode) form of a host; IP literals are canonicalised by the URL parser. */
export function normalizeHost(host: string): string {
  if (host === '') return '';
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return host.toLowerCase();
  }
}

/** Explicit port, or `null` when it is absent or equal to the scheme's default. */
export function normalizePort(scheme: string, port: string | number | null): number | null {
  if (port === null || port === '') return null;
  const value = typeof port === 'number' ? port : Number(port);
  return DEFAULT_PORTS[scheme.toLowerCase()] === value ? null : value;
}

/** Equivalent encodings compare equal; `/a/` and `/a` too; an empty path is `/`. */
export function normalizePath(path: string): string {
  const normalized = normalizePercentEncoding(path);
  if (normalized === '' || normalized === '/') return '/';
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

/** Key used to detect redirect loops: the WHATWG href without its fragment. */
export function loopKey(href: string): string {
  const hash = href.indexOf('#');
  return hash < 0 ? href : href.slice(0, hash);
}
