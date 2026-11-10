/**
 * Anonymous visitor pseudonym (FR-036, research R7):
 *   subjectHash = HMAC-SHA256(IP or IPv6 /64 prefix, dailyKey)
 *   dailyKey    = HMAC-SHA256(server secret, UTC date)
 * The IP is never stored; the key rotates every UTC day, so hashes cannot be linked across days.
 */
import { createHmac } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';

export function dailyKey(secret: string, now: Date): Buffer {
  return createHmac('sha256', secret).update(now.toISOString().slice(0, 10)).digest();
}

/** What is hashed: the IPv4 address, or the /64 prefix of an IPv6 address. */
export function quotaSubjectInput(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped?.[1]) return mapped[1];
  if (isIPv4(ip) || !isIPv6(ip)) return ip;
  const groups = expandIPv6(ip)
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''));
  return `${groups.join(':')}::/64`;
}

export function subjectHash(ip: string, secret: string, now: Date): string {
  return createHmac('sha256', dailyKey(secret, now)).update(quotaSubjectInput(ip)).digest('hex');
}

/** Full 8-group form of an IPv6 address (no zone, no embedded IPv4). */
export function expandIPv6(ip: string): string[] {
  let address = ip.replace(/^\[|\]$/g, '').split('%')[0] ?? '';
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (v4?.[1]) {
    const [a = 0, b = 0, c = 0, d = 0] = v4[1].split('.').map(Number);
    address =
      address.slice(0, -v4[1].length) +
      `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = '', tail] = address.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const fill = tail === undefined ? [] : Array<string>(8 - left.length - right.length).fill('0');
  return [...left, ...fill, ...right].map((g) => g.padStart(4, '0').toLowerCase());
}
