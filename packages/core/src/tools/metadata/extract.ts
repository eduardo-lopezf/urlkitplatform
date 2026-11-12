/**
 * Metadata extraction (002/T043, research R4). Pure: it receives the bytes the chain probe read,
 * decodes them, walks the tree built by the injected HTML parser and decides the value a link
 * preview would show. Nothing of the document is executed; every value is returned as text.
 */
import type { MessageRef } from '../../types.ts';
import { parseUrl } from '../../url/parse.ts';
import type { MetadataField, MetadataSource, RuleCatalog } from '../clean/catalog.ts';
import type { ChainObservation } from '../headers/types.ts';
import type { StopReason } from '../inspect/types.ts';
import { decodeDocument, sniffEncoding, type EncodingChoice } from './encoding.ts';
import type { HtmlNode, ParseHtml } from './types.ts';

export interface EffectiveValue {
  value: string;
  from: MetadataSource;
}

export interface MetadataSources {
  basic: Record<string, string>;
  openGraph: Record<string, string[]>;
  twitter: Record<string, string[]>;
  links: {
    canonical?: string;
    icon?: string[];
    alternate?: Array<{ hreflang: string; href: string }>;
  };
  lang?: string;
}

export interface PageMetadata {
  input: string;
  finalUrl: string | null;
  hops: number;
  stopReason: StopReason;
  contentType: string | null;
  encoding?: EncodingChoice;
  truncated: boolean;
  sources: MetadataSources;
  effective: Partial<Record<MetadataField, EffectiveValue>>;
  warnings: MessageRef[];
  error?: MessageRef;
  catalogVersion: string;
}

const HTML_NS = 'http://www.w3.org/1999/xhtml';

/** Where each effective field is read from, per source. `basic.url` is the canonical link. */
const KEYS: Record<MetadataField, Partial<Record<MetadataSource, string>>> = {
  title: { openGraph: 'title', twitter: 'title', basic: 'title' },
  description: { openGraph: 'description', twitter: 'description', basic: 'description' },
  image: { openGraph: 'image', twitter: 'image' },
  url: { openGraph: 'url', basic: 'url' },
  siteName: { openGraph: 'site_name' },
  type: { openGraph: 'type' },
};
const FIELDS = Object.keys(KEYS) as MetadataField[];

/** Open Graph and Twitter properties whose value is a URL, resolved against the document base. */
const URL_PROPERTIES = new Set(['image', 'image:url', 'image:secure_url', 'url', 'video', 'audio']);

const emptySources = (): MetadataSources => ({ basic: {}, openGraph: {}, twitter: {}, links: {} });

export function extractMetadata(
  observation: ChainObservation,
  catalog: RuleCatalog,
  parseHtml: ParseHtml,
): PageMetadata {
  const precedence = catalog.metadata?.precedence;
  if (!precedence) throw new Error('metadata needs the metadata criteria of the catalog');
  const { chain, finalResponse } = observation;
  const base = {
    input: chain.input,
    finalUrl: chain.final,
    hops: Math.max(0, chain.hops.length - 1),
    stopReason: chain.stopReason,
    catalogVersion: catalog.version,
  };

  if (chain.stopReason !== 'final' || !finalResponse || !chain.final) {
    const error = chain.hops.at(-1)?.error;
    return {
      ...base,
      contentType: null,
      truncated: false,
      sources: emptySources(),
      effective: {},
      warnings: [],
      ...(error ? { error } : {}),
    };
  }

  const contentType = finalResponse.contentType;
  const truncated = finalResponse.bodyTruncated;
  if (!/html/i.test(contentType ?? '')) {
    return {
      ...base,
      contentType,
      truncated,
      sources: emptySources(),
      effective: {},
      warnings: [{ code: 'metadata.not-html', params: { type: contentType ?? '' } }],
    };
  }

  const bytes = finalResponse.body ?? new Uint8Array();
  const encoding = sniffEncoding(bytes, contentType);
  const { sources, rawImage } = read(parseHtml(decodeDocument(bytes, encoding.label)), chain.final);
  const effective = choose(sources, precedence);

  const warnings: MessageRef[] = [];
  if (encoding.warning) warnings.push(encoding.warning);
  if (!effective.title) warnings.push({ code: 'metadata.missing-title' });
  if (!effective.description) warnings.push({ code: 'metadata.missing-description' });
  if (!effective.image) warnings.push({ code: 'metadata.missing-image' });
  const canonical = sources.links.canonical;
  if (canonical && registrable(canonical) !== registrable(chain.final))
    warnings.push({ code: 'metadata.canonical-cross-domain', params: { canonical } });
  if (rawImage !== undefined && !isAbsolute(rawImage))
    warnings.push({ code: 'metadata.image-relative' });
  if (truncated) warnings.push({ code: 'metadata.truncated' });

  return { ...base, contentType, encoding, truncated, sources, effective, warnings };
}

function registrable(url: string): string | null {
  const parsed = parseUrl(url, { standard: true });
  return parsed.ok ? (parsed.value.registrableDomain ?? parsed.value.host.ascii) : null;
}

function isAbsolute(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function resolve(value: string, base: string): string {
  try {
    return new URL(value.trim(), base).href;
  } catch {
    return value;
  }
}

const attr = (node: HtmlNode, name: string) =>
  node.attrs?.find((a) => a.name === name)?.value ?? null;

/** HTML elements in document order, wherever the parser placed them; `<template>` is skipped. */
function* elements(node: HtmlNode): Generator<HtmlNode> {
  for (const child of node.childNodes ?? []) {
    if (!child.tagName) continue;
    const ns = (child as { namespaceURI?: string }).namespaceURI;
    if (ns !== undefined && ns !== HTML_NS) continue; // <title> inside <svg> is not the title
    yield child;
    if (child.tagName !== 'template') yield* elements(child);
  }
}

/** Text of an element with ASCII whitespace stripped and collapsed, as `document.title`. */
function text(node: HtmlNode): string {
  const parts: string[] = [];
  const walk = (n: HtmlNode) => {
    for (const c of n.childNodes ?? []) {
      if (c.nodeName === '#text') parts.push(c.value ?? '');
      else walk(c);
    }
  };
  walk(node);
  return parts
    .join('')
    .replace(/[\t\n\f\r ]+/g, ' ')
    .trim();
}

function read(
  document: HtmlNode,
  finalUrl: string,
): { sources: MetadataSources; rawImage?: string } {
  const all = [...elements(document)];
  const baseHref = all.find((e) => e.tagName === 'base' && attr(e, 'href') !== null);
  const base = baseHref ? resolve(attr(baseHref, 'href') ?? '', finalUrl) : finalUrl;

  const sources = emptySources();
  let rawImage: string | undefined;
  const push = (group: Record<string, string[]>, key: string, value: string) =>
    (group[key] ??= []).push(value);

  for (const el of all) {
    if (el.tagName === 'html') {
      const lang = attr(el, 'lang');
      if (lang && sources.lang === undefined) sources.lang = lang;
    } else if (el.tagName === 'title' && sources.basic.title === undefined) {
      sources.basic.title = text(el);
    } else if (el.tagName === 'meta') {
      const content = attr(el, 'content');
      if (content === null) continue;
      const key = (attr(el, 'property') ?? attr(el, 'name') ?? '').trim().toLowerCase();
      if (key === 'description' && sources.basic.description === undefined) {
        sources.basic.description = content.trim();
      } else if (key.startsWith('og:')) {
        const prop = key.slice(3);
        if (prop === 'image' && rawImage === undefined) rawImage = content.trim();
        push(
          sources.openGraph,
          prop,
          URL_PROPERTIES.has(prop) ? resolve(content, base) : content.trim(),
        );
      } else if (key.startsWith('twitter:')) {
        const prop = key.slice(8);
        push(
          sources.twitter,
          prop,
          URL_PROPERTIES.has(prop) ? resolve(content, base) : content.trim(),
        );
      }
    } else if (el.tagName === 'link') {
      const href = attr(el, 'href');
      if (href === null) continue;
      const rel = (attr(el, 'rel') ?? '').toLowerCase().split(/\s+/);
      if (rel.includes('canonical') && sources.links.canonical === undefined)
        sources.links.canonical = resolve(href, base);
      if (rel.includes('icon') || rel.includes('apple-touch-icon'))
        (sources.links.icon ??= []).push(resolve(href, base));
      const hreflang = attr(el, 'hreflang');
      if (rel.includes('alternate') && hreflang)
        (sources.links.alternate ??= []).push({ hreflang, href: resolve(href, base) });
    }
  }
  return rawImage === undefined ? { sources } : { sources, rawImage };
}

function choose(
  sources: MetadataSources,
  precedence: Record<MetadataField, MetadataSource[]>,
): Partial<Record<MetadataField, EffectiveValue>> {
  const lookup = (source: MetadataSource, key: string): string | undefined => {
    if (source === 'basic') return key === 'url' ? sources.links.canonical : sources.basic[key];
    const group = source === 'openGraph' ? sources.openGraph : sources.twitter;
    return group[key]?.find((v) => v !== '');
  };
  const out: Partial<Record<MetadataField, EffectiveValue>> = {};
  for (const field of FIELDS) {
    for (const source of precedence[field]) {
      const key = KEYS[field][source];
      const value = key === undefined ? undefined : lookup(source, key);
      if (value) {
        out[field] = { value, from: source };
        break;
      }
    }
  }
  return out;
}
