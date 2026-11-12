/**
 * Character encoding of an HTML document, in the order the HTML standard uses (002/T042,
 * research R4): byte order mark, then the transport charset (`Content-Type`), then a prescan of
 * the first 1024 bytes for `<meta charset>`, then `windows-1252`. Pure: bytes in, label out.
 */
import type { MessageRef } from '../../types.ts';

export interface EncodingChoice {
  /** WHATWG encoding name, as `TextDecoder.encoding` reports it. */
  label: string;
  source: 'bom' | 'header' | 'meta' | 'default';
  warning?: MessageRef;
}

const DEFAULT = 'windows-1252';
const PRESCAN_BYTES = 1024;

/** Canonical WHATWG name of a label, or `null` if the label is unknown. */
function canonical(label: string): string | null {
  try {
    return new TextDecoder(label.trim()).encoding;
  } catch {
    return null;
  }
}

function bom(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  return null;
}

function headerCharset(contentType: string | null): string | null {
  const match = /;\s*charset\s*=\s*("?)([^";\s]+)\1/i.exec(contentType ?? '');
  return match?.[2] ?? null;
}

/** Simplified prescan: comments are skipped and `charset=` is read from `<meta>` tags. */
function metaCharset(bytes: Uint8Array): string | null {
  const head = new TextDecoder('windows-1252')
    .decode(bytes.subarray(0, PRESCAN_BYTES))
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  for (const [tag] of head.matchAll(/<meta\b[^>]*>?/gi)) {
    const charset = /\bcharset\s*=\s*["']?\s*([^"'\s;/>]+)/i.exec(tag)?.[1];
    if (charset) return charset;
  }
  return null;
}

export function sniffEncoding(bytes: Uint8Array, contentType: string | null): EncodingChoice {
  const fromBom = bom(bytes);
  if (fromBom) return { label: fromBom, source: 'bom' };

  for (const [source, raw] of [
    ['header', headerCharset(contentType)],
    ['meta', metaCharset(bytes)],
  ] as const) {
    if (raw === null) continue;
    let label = canonical(raw);
    if (label === null)
      return {
        label: DEFAULT,
        source: 'default',
        warning: { code: 'metadata.unknown-encoding', params: { label: raw.toLowerCase() } },
      };
    // HTML standard: a <meta> that claims UTF-16 is read as UTF-8; x-user-defined as windows-1252.
    if (source === 'meta' && label.startsWith('utf-16')) label = 'utf-8';
    if (label === 'x-user-defined') label = DEFAULT;
    return { label, source };
  }
  return { label: DEFAULT, source: 'default' };
}

/** Decodes with the chosen label; the BOM, if any, is dropped. Never throws. */
export function decodeDocument(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder(DEFAULT).decode(bytes);
  }
}
