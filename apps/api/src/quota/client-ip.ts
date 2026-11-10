/**
 * Client address used to derive the anonymous quota subject. It is never logged or stored:
 * it only feeds the daily pseudonym in subject.ts.
 *
 * Behind one trusted proxy (Caddy), only the last X-Forwarded-For entry is reliable: it is the
 * one the proxy added. Earlier entries come from the client and would let anyone dodge quotas.
 */
export function clientIpFrom(input: {
  forwardedFor: string | undefined;
  remote: string | undefined;
  trustProxy: boolean;
}): string {
  if (input.trustProxy) {
    const entries = (input.forwardedFor ?? '').split(',').map((entry) => entry.trim());
    const forwarded = entries.findLast((entry) => entry !== '');
    if (forwarded) return forwarded;
  }
  return input.remote ?? 'unknown';
}
