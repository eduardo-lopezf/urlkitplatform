/**
 * SSRF validation (Principio V, docs/arquitectura.md §9). Pure functions, verified against the
 * shared vectors in tests/ssrf-vectors. The same rules must hold in any language that connects.
 */
import { isIPv4, isIPv6 } from 'node:net';
import { expandIPv6 } from '../privacy/subject-hash.ts';

export type BlockReason = 'private-address' | 'scheme' | 'credentials' | 'port' | 'unresolvable';

export interface Policy {
  /** `null` allows any port (fixture tests only). */
  allowedPorts: ReadonlySet<number> | null;
  isBlocked: (address: string) => boolean;
}

/** IPv4 ranges that are never public: [network, prefix length]. */
const IPV4_BLOCKED: Array<[string, number]> = [
  ['0.0.0.0', 8], // this network, unspecified
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. 169.254.169.254 (cloud metadata)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. broadcast
];

const toInt = (ip: string) =>
  ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;

function ipv4Blocked(ip: string): boolean {
  const value = toInt(ip);
  return IPV4_BLOCKED.some(([network, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (toInt(network) & mask);
  });
}

function embeddedIPv4(groups: string[], from: number): string {
  const hi = parseInt(groups[from] ?? '0', 16);
  const lo = parseInt(groups[from + 1] ?? '0', 16);
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
}

function ipv6Blocked(ip: string): boolean {
  const g = expandIPv6(ip);
  const n = g.map((x) => parseInt(x, 16));
  const first = n[0] ?? 0;
  if (n.every((x) => x === 0)) return true; // ::
  if (n.slice(0, 7).every((x) => x === 0) && n[7] === 1) return true; // ::1
  if (n.slice(0, 5).every((x) => x === 0) && n[5] === 0xffff)
    return ipv4Blocked(embeddedIPv4(g, 6)); // ::ffff:a.b.c.d
  if (n.slice(0, 6).every((x) => x === 0)) return true; // ::a.b.c.d (deprecated IPv4-compatible)
  if (first === 0x64 && n[1] === 0xff9b && n.slice(2, 6).every((x) => x === 0))
    return ipv4Blocked(embeddedIPv4(g, 6)); // NAT64
  if (first === 0x64 && n[1] === 0xff9b && n[2] === 1) return true; // local-use NAT64
  if (first === 0x2002) return ipv4Blocked(embeddedIPv4(g, 1)); // 6to4
  if (first === 0x0100 && n.slice(1, 4).every((x) => x === 0)) return true; // discard 100::/64
  if (first === 0x2001 && (n[1] ?? 0) < 0x0200) return true; // 2001::/23 IETF protocol (Teredo, ORCHID…)
  if (first === 0x2001 && n[1] === 0x0db8) return true; // documentation
  if ((first & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((first & 0xffc0) === 0xfec0) return true; // site-local fec0::/10 (deprecated)
  if ((first & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/** `true` for any address that is not a public unicast address. Unparseable input is blocked. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '');
  if (isIPv4(ip)) return ipv4Blocked(ip);
  if (isIPv6(ip)) return ipv6Blocked(ip);
  return true;
}

export const DEFAULT_PORTS = new Set([80, 443, 8080, 8443]);

export const DEFAULT_POLICY: Policy = { allowedPorts: DEFAULT_PORTS, isBlocked: isBlockedAddress };

/** Scheme, credentials and port: checked on every hop before resolving anything. */
export function checkShape(url: URL, policy: Policy): BlockReason | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'scheme';
  if (url.username !== '' || url.password !== '') return 'credentials';
  const port = url.port === '' ? (url.protocol === 'https:' ? 443 : 80) : Number(url.port);
  if (policy.allowedPorts && !policy.allowedPorts.has(port)) return 'port';
  return null;
}

export type Resolver = (hostname: string) => Promise<string[]>;

export type Target =
  { ok: true; address: string; family: 4 | 6 } | { ok: false; reason: BlockReason };

/**
 * Resolves the host **once**, validates **every** address and returns the one to connect to.
 * The caller must connect to exactly this address (IP pinning closes the DNS rebinding window).
 */
export async function resolveTarget(url: URL, resolve: Resolver, policy: Policy): Promise<Target> {
  const shape = checkShape(url, policy);
  if (shape) return { ok: false, reason: shape };
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const literal = isIPv4(host) || isIPv6(host);
  const addresses = literal ? [host] : await resolve(url.hostname).catch(() => []);
  if (addresses.length === 0) return { ok: false, reason: 'unresolvable' };
  if (addresses.some((a) => policy.isBlocked(a))) return { ok: false, reason: 'private-address' };
  const address = addresses[0] ?? host;
  return { ok: true, address, family: isIPv6(address) ? 6 : 4 };
}
