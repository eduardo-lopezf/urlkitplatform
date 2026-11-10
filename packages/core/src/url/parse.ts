/**
 * URL analysis on top of the native WHATWG `URL` (research R2), validated against the Web
 * Platform Tests vectors. The query is read from the serialised URL without URLSearchParams so
 * order, repeated names and original percent-encodings are preserved.
 */
import { toUnicode } from './punycode.ts';
import { parse as parseDomain } from 'tldts';
import type { MessageCode } from '../codes.ts';
import type { HostKind, MessageRef, ParsedUrl, QueryParam, Result } from '../types.ts';
import { toolError } from '../types.ts';
import { formDecode, isValidEncoding, percentDecode } from './encoding.ts';
import { SPECIAL_SCHEMES, splitRaw } from './raw.ts';

export const MAX_INPUT_LENGTH = 32_000;

export const DEFAULT_PORTS: Readonly<Record<string, number>> = {
  http: 80,
  https: 443,
  ws: 80,
  wss: 443,
  ftp: 21,
};

export interface ParseOptions {
  /** Resolve relative input against this base (implies `standard`). */
  base?: string;
  /**
   * Pure WHATWG behaviour: no trimming beyond the standard, no `https://` assumption and no
   * multiple-URL detection. Used by the WPT conformance suite.
   */
  standard?: boolean;
}

const KNOWN_SCHEME =
  /^(https?|wss?|ftp|file|mailto|tel|sms|data|javascript|vbscript|blob|about|urn|news|irc|ssh|git|magnet|geo|market|intent|view-source)$/i;

const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.|[^\s/?#:]+\.[a-z]{2,}(?:[/:?#]|$))/i;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export function parseUrl(input: string, options: ParseOptions = {}): Result<ParsedUrl> {
  const standard = options.standard === true || options.base !== undefined;
  const warnings: MessageRef[] = [];
  const warn = (code: MessageCode, params?: MessageRef['params']) => {
    if (!warnings.some((w) => w.code === code))
      warnings.push({ code, ...(params ? { params } : {}) });
  };

  let text = standard ? input : input.trim();
  if (text.length > MAX_INPUT_LENGTH) return { ok: false, error: toolError('url.too-long') };
  if (!standard && text === '') return { ok: false, error: toolError('url.invalid', 'url') };

  if (!standard) {
    const tokens = text.split(/\s+/);
    if (tokens.length > 1 && tokens.slice(1).some((t) => URL_LIKE.test(t))) {
      text = tokens[0] ?? text;
      warn('input.multiple-urls');
    }
  }
  const original = text;

  let schemeAssumed = false;
  if (!standard) {
    if (/[\t\n\r]/.test(text)) warn('parse.warning.control-chars');
    if (needsScheme(text)) {
      text = (text.startsWith('//') ? 'https:' : 'https://') + text;
      schemeAssumed = true;
      warn('input.scheme-assumed');
    }
  }

  let url: URL;
  try {
    url = options.base === undefined ? new URL(text) : new URL(text, options.base);
  } catch {
    return { ok: false, error: toolError('url.invalid', locateInvalidPart(text)) };
  }

  const scheme = url.protocol.slice(0, -1);
  const special = SPECIAL_SCHEMES.has(scheme);
  const raw = splitRaw(text);
  const hostKind = classifyHost(url.hostname, special);

  if (special && /\\/.test(text.split(/[?#]/)[0] ?? '')) warn('parse.warning.backslash');
  if (hostKind === 'ipv4' && raw.host !== null && raw.host !== url.hostname) {
    warn('parse.warning.numeric-ipv4', { host: url.hostname });
  }
  if (!special && url.hostname !== '') warn('parse.warning.non-special-scheme');

  const query = parseQuery(url.search);
  if (query.some((p) => !p.encodingValid) || !isValidEncoding(url.pathname)) {
    warn('parse.warning.invalid-encoding');
  }

  const domain =
    hostKind === 'domain' ? parseDomain(url.hostname, { allowPrivateDomains: true }) : null;

  return ok({
    input: original,
    href: url.href,
    schemeAssumed,
    scheme,
    username: url.username,
    password: url.password,
    host: {
      ascii: url.hostname,
      unicode: hostKind === 'domain' ? hostToUnicode(url.hostname) : url.hostname,
      kind: hostKind,
    },
    registrableDomain: domain?.domain ?? null,
    subdomain: domain?.subdomain ? domain.subdomain : null,
    port:
      url.port === ''
        ? { value: DEFAULT_PORTS[scheme] ?? null, isDefault: true }
        : { value: Number(url.port), isDefault: false },
    path: {
      raw: url.pathname,
      decoded: percentDecode(url.pathname),
      segments:
        url.pathname.startsWith('/') && url.pathname !== '/'
          ? url.pathname.slice(1).split('/').map(percentDecode)
          : [],
    },
    query,
    fragment: url.hash !== '' ? url.hash.slice(1) : url.href.endsWith('#') ? '' : null,
    warnings,
  });
}

/** Unicode form of an ASCII host, label by label; labels that are not valid Punycode stay as is. */
export function hostToUnicode(ascii: string): string {
  return ascii
    .split('.')
    .map((label) => {
      if (!label.toLowerCase().startsWith('xn--')) return label;
      try {
        return toUnicode(label);
      } catch {
        return label;
      }
    })
    .join('.');
}

export function parseQuery(search: string): QueryParam[] {
  if (search === '' || search === '?') return [];
  return search
    .slice(1)
    .split('&')
    .map((piece, index) => {
      const eq = piece.indexOf('=');
      const rawName = eq < 0 ? piece : piece.slice(0, eq);
      const rawValue = eq < 0 ? null : piece.slice(eq + 1);
      return {
        index,
        name: formDecode(rawName),
        value: rawValue === null ? null : formDecode(rawValue),
        rawName,
        rawValue,
        encodingValid: isValidEncoding(rawName) && (rawValue === null || isValidEncoding(rawValue)),
      };
    });
}

function classifyHost(hostname: string, special: boolean): HostKind {
  if (hostname === '') return 'none';
  if (hostname.startsWith('[')) return 'ipv6';
  if (!special) return 'opaque';
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return 'ipv4';
  return 'domain';
}

/** Decides whether input without a recognisable scheme should get `https://`. */
function needsScheme(text: string): boolean {
  if (text.startsWith('//')) return true;
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/s.exec(text);
  if (!match) return true;
  const [, candidate = '', rest = ''] = match;
  if (KNOWN_SCHEME.test(candidate)) return false;
  if (/^\d+(?:[/?#]|$)/.test(rest)) return true; // host:port
  return candidate.includes('.') && !rest.startsWith('//');
}

/** Best-effort location of the invalid part, so the error can name it (FR-008). */
function locateInvalidPart(text: string): string {
  const raw = splitRaw(text);
  if (raw.scheme === null) return 'scheme';
  if (raw.port !== null && (!/^\d*$/.test(raw.port) || Number(raw.port) > 65_535)) return 'port';
  if (raw.host !== null && (raw.host === '' || /[\s<>^|%"`{}]/.test(raw.host))) return 'host';
  if (raw.host !== null && raw.host.startsWith('[') && !raw.host.endsWith(']')) return 'host';
  return 'url';
}
