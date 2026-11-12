/**
 * Pure Redirect Inspector logic (research R13): deciding whether a hop is a redirect, whether
 * there is a loop, whether the hop limit is reached and what the final destination is happens
 * here, never in the API. The network adapter (`fetchHop`) only reports what it observed.
 */
import type { Result } from '../../types.ts';
import { toolError } from '../../types.ts';
import { loopKey } from '../../url/normalize.ts';
import { parseUrl } from '../../url/parse.ts';
import type { FetchHop, Hop, HopFlag, HopType, RedirectChain, StopReason } from './types.ts';

/** FR-031: at most 20 redirects, so at most 21 hops including the origin. */
export const MAX_HOPS = 20;

export function classifyStatus(status: number): HopType {
  if (status === 301 || status === 308) return 'permanent';
  if (status === 302 || status === 303 || status === 307) return 'temporary';
  return 'final';
}

const META_TAG = /<meta\b[^>]*>/gi;
const ATTR = (name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');

/** `<noscript>` content: a browser with scripts enabled, as the person's is, never applies it. */
const NOSCRIPT = /<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi;

/** Target of `<meta http-equiv="refresh" content="N; url=…">`, unresolved, or `null`. */
export function parseMetaRefresh(html: string | null): string | null {
  if (!html) return null;
  for (const [tag] of html.replace(NOSCRIPT, '').matchAll(META_TAG)) {
    const equiv = ATTR('http-equiv').exec(tag);
    if ((equiv?.[1] ?? equiv?.[2] ?? equiv?.[3] ?? '').toLowerCase() !== 'refresh') continue;
    const content = ATTR('content').exec(tag);
    // Attribute values may carry entities (`url=&quot;…&quot;`, `&amp;` in the query).
    const value = decodeEntities(content?.[1] ?? content?.[2] ?? content?.[3] ?? '');
    const url = /^\s*\d*(?:\.\d*)?\s*[;,]\s*url\s*=\s*(.+?)\s*$/i.exec(value)?.[1];
    if (url) return url.replace(/^(['"])(.*)\1$/, '$2');
  }
  return null;
}

// A whole identifier: `geolocation`, `_location` or `a.location` are not `location`.
const LOCATION = String.raw`(?<![\w$.])(?:(?:window|document|top|self|parent)\.)?location(?![\w$])`;
const LITERAL_ASSIGN = new RegExp(
  String.raw`${LOCATION}(?:\.href)?\s*=\s*(["'\x60])([^"'\x60]+)\1\s*(?:[;)<\n]|$)`,
);
const LITERAL_CALL = new RegExp(
  String.raw`${LOCATION}\.(?:replace|assign)\(\s*(["'\x60])([^"'\x60]+)\1\s*\)`,
);
const ANY_REDIRECT = new RegExp(
  String.raw`${LOCATION}(?:\.href)?\s*=(?!=)|${LOCATION}\.(?:replace|assign)\(`,
);

/** Script elements, including one left open by the read limit. */
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)(?:<\/script\s*>|$)/gi;
const SCRIPT_TYPE = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const JS_TYPE = /^(?:|module|(?:text|application)\/(?:x-)?(?:java|ecma)script)$/i;

/** The JavaScript of a document: the content of its executable `<script>` elements only. */
function scriptText(html: string): string {
  const parts: string[] = [];
  for (const [, attributes = '', body = ''] of html.matchAll(SCRIPT)) {
    const type = SCRIPT_TYPE.exec(attributes);
    if (JS_TYPE.test((type?.[1] ?? type?.[2] ?? type?.[3] ?? '').trim())) parts.push(body);
  }
  return parts.join('\n');
}

/**
 * Detects a JavaScript redirect without executing anything (FR-033). Only a literal string
 * assigned to `location` is followable (data-model.md); anything computed is reported only.
 * Only script content counts: an HTML attribute such as `data-form-location="…"` is not code.
 */
export function detectJsRedirect(
  html: string | null,
): { url: string | null; literal: boolean } | null {
  if (!html) return null;
  const code = scriptText(html);
  if (!code) return null;
  const literal = LITERAL_ASSIGN.exec(code) ?? LITERAL_CALL.exec(code);
  if (literal?.[2] && !literal[2].includes('${')) return { url: literal[2], literal: true };
  return ANY_REDIRECT.test(code) ? { url: null, literal: false } : null;
}

const ANCHOR_HREF = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const NAMED_ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|(amp|quot|apos|lt|gt));/gi,
    (match, dec?: string, hex?: string, name?: string) => {
      if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? match;
      const code = dec ? Number(dec) : parseInt(hex ?? '', 16);
      return code <= 0x10ffff ? String.fromCodePoint(code) : match;
    },
  );
}

/** Serialised absolute `http(s)` URL, or `null` for anything else (relative, other schemes). */
function absoluteHttp(text: string): string | null {
  try {
    const url = new URL(text.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Exit link of an interstitial page (FR-037, research R22): an `<a href>` identical to a URL that
 * one of the page's own query parameters names. Generic on purpose: no list of sites.
 */
export function findInterstitialLink(pageUrl: string, html: string | null): string | null {
  if (!html) return null;
  let params: URLSearchParams;
  try {
    params = new URL(pageUrl).searchParams;
  } catch {
    return null;
  }
  const named = new Set<string>();
  for (const [, value] of params) {
    const url = absoluteHttp(value);
    if (url) named.add(url);
  }
  if (named.size === 0) return null;
  for (const match of html.matchAll(ANCHOR_HREF)) {
    const url = absoluteHttp(decodeEntities(match[1] ?? match[2] ?? match[3] ?? ''));
    if (url && named.has(url)) return url;
  }
  return null;
}

function siteOf(href: string): string | null {
  const parsed = parseUrl(href, { standard: true });
  return parsed.ok ? (parsed.value.registrableDomain ?? parsed.value.host.ascii) : null;
}

function flagsFor(from: string, to: string): HopFlag[] {
  const flags: HopFlag[] = [];
  if (from.startsWith('https:') && to.startsWith('http:')) flags.push('https-downgrade');
  if (siteOf(from) !== siteOf(to)) flags.push('domain-change');
  return flags;
}

export async function inspect(input: string, fetchHop: FetchHop): Promise<Result<RedirectChain>> {
  const start = parseUrl(input);
  if (!start.ok) return start;
  if (start.value.scheme !== 'http' && start.value.scheme !== 'https') {
    return { ok: false, error: toolError('url.unsupported-scheme', 'scheme') };
  }

  const hops: Hop[] = [];
  const seen = new Set<string>();
  let url = start.value.href;
  let lastReached: string | null = null;
  const done = (stopReason: StopReason, final: string | null): Result<RedirectChain> => ({
    ok: true,
    value: {
      input,
      hops,
      final,
      stopReason,
      totalMs: hops.reduce((sum, h) => sum + h.durationMs, 0),
    },
  });

  for (;;) {
    seen.add(loopKey(url));
    const response = await fetchHop(url);
    const hop: Hop = {
      index: hops.length,
      url,
      status: null,
      type: 'final',
      location: null,
      durationMs: Math.round(response.durationMs),
      flags: [],
    };
    hops.push(hop);

    if (response.kind === 'blocked') {
      hop.error = { code: response.code };
      return done('blocked', lastReached);
    }
    if (response.kind === 'error') {
      hop.error = { code: response.code };
      return done(response.code === 'inspect.timeout' ? 'timeout' : 'error', lastReached);
    }

    hop.status = response.status;
    lastReached = url;
    let next: string | null = null;
    const statusType = classifyStatus(response.status);
    if (statusType !== 'final' && response.location) {
      hop.type = statusType;
      next = response.location;
    } else if (response.status >= 200 && response.status < 300) {
      const meta = parseMetaRefresh(response.html);
      const js = meta ? null : detectJsRedirect(response.html);
      if (meta) {
        hop.type = 'meta-refresh';
        next = meta;
      } else if (js) {
        hop.type = 'javascript';
        next = js.url;
      } else {
        next = findInterstitialLink(url, response.html);
        if (next) hop.type = 'interstitial';
      }
    }
    if (next === null) return done('final', url);

    let resolved: string;
    try {
      resolved = new URL(next, url).href;
    } catch {
      hop.error = { code: 'inspect.invalid-location' };
      return done('error', lastReached);
    }
    hop.location = resolved;
    hop.flags = flagsFor(url, resolved);
    if (seen.has(loopKey(resolved))) return done('loop', url);
    if (hops.length > MAX_HOPS) return done('max-hops', url);
    url = resolved;
  }
}
