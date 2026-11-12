/**
 * The host TLS and DNS work on (002/T016). Accepts a URL or a bare host with an optional port and
 * reuses the WHATWG analysis of parseUrl, so the network tools never parse hosts on their own.
 */
import type { Result } from '../types.ts';
import { toolError } from '../types.ts';
import { parseUrl } from './parse.ts';

export interface HostInfo {
  unicode: string;
  /** As serialised by the URL Standard: Punycode for IDN, brackets for IPv6. */
  ascii: string;
  /** Per the Public Suffix List; `null` for IPs and names without one. */
  registrable: string | null;
  /** Explicit, non-default port of the input; `null` otherwise. */
  port: number | null;
  kind: 'name' | 'ip';
  /** Special-use names (RFC 6761, RFC 6762, RFC 7686, RFC 8375, `.internal`): never queried. */
  specialUse: boolean;
}

const SPECIAL_USE = [
  'localhost',
  'local',
  'test',
  'invalid',
  'example',
  'onion',
  'internal',
  'home.arpa',
];

export function isSpecialUseName(ascii: string): boolean {
  const name = ascii.toLowerCase().replace(/\.$/, '');
  return SPECIAL_USE.some((suffix) => name === suffix || name.endsWith(`.${suffix}`));
}

export function analyzeHost(input: string): Result<HostInfo> {
  const parsed = parseUrl(input);
  if (!parsed.ok) {
    return parsed.error.code === 'url.too-long'
      ? parsed
      : { ok: false, error: toolError('host.invalid', 'host') };
  }
  const { host, port, registrableDomain, warnings } = parsed.value;
  // A space inside the input would make parseUrl keep only the first token, and the tool would
  // silently query a different host than the one typed.
  const truncated = warnings.some((w) => w.code === 'input.multiple-urls');
  if (truncated || (host.kind !== 'domain' && host.kind !== 'ipv4' && host.kind !== 'ipv6'))
    return { ok: false, error: toolError('host.invalid', 'host') };

  const kind = host.kind === 'domain' ? 'name' : 'ip';
  return {
    ok: true,
    value: {
      unicode: host.unicode,
      ascii: host.ascii,
      registrable: registrableDomain,
      port: port.isDefault ? null : port.value,
      kind,
      specialUse: kind === 'name' && isSpecialUseName(host.ascii),
    },
  };
}
