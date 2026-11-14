/**
 * Verifies the `Authorization` header of a request (003, research R3 and R8).
 *
 * Results, valid and invalid, are cached in memory for 30 s: every instance sees a revocation,
 * a deactivation or a plan change in under a minute (FR-013, FR-022) without coordination, and
 * almost no request touches the database (SC-004). The cache holds the hash, never the secret.
 */
import { timingSafeEqual } from 'node:crypto';
import { hashSecret, parseKey } from './key-format.ts';
import type { KeyStore } from './key-store.ts';

export type Verification =
  | { kind: 'valid'; organizationId: string; planId: string; keyId: string }
  | { kind: 'invalid' }
  | { kind: 'unavailable' };

export interface KeyVerifier {
  verify(authorization: string): Promise<Verification>;
}

type Entry =
  | { expires: number; valid: false }
  | { expires: number; valid: true; organizationId: string; planId: string; secretHash: Buffer };

const INVALID = { kind: 'invalid' } as const;
const BEARER = /^bearer +(\S+)$/i;

export function createKeyVerifier({
  store,
  now = Date.now,
  ttlMs = 30_000,
  maxEntries = 10_000,
}: {
  store: KeyStore;
  now?: () => number;
  ttlMs?: number;
  maxEntries?: number;
}): KeyVerifier {
  const cache = new Map<string, Entry>();

  async function lookup(id: string): Promise<Entry | 'unavailable'> {
    const cached = cache.get(id);
    if (cached && cached.expires > now()) return cached;
    let record;
    try {
      record = await store.findKey(id);
    } catch {
      return 'unavailable';
    }
    const expires = now() + ttlMs;
    const entry: Entry =
      record && record.revokedAt === null && record.organizationStatus === 'active'
        ? {
            expires,
            valid: true,
            organizationId: record.organizationId,
            planId: record.planId,
            secretHash: record.secretHash,
          }
        : { expires, valid: false };
    cache.delete(id);
    cache.set(id, entry);
    if (cache.size > maxEntries) cache.delete(cache.keys().next().value as string);
    return entry;
  }

  return {
    async verify(authorization) {
      const token = BEARER.exec(authorization.trim())?.[1];
      const parsed = token ? parseKey(token) : null;
      if (!parsed) return INVALID;
      const entry = await lookup(parsed.id);
      if (entry === 'unavailable') return { kind: 'unavailable' };
      if (!entry.valid || !timingSafeEqual(entry.secretHash, hashSecret(parsed.secret)))
        return INVALID;
      return {
        kind: 'valid',
        organizationId: entry.organizationId,
        planId: entry.planId,
        keyId: parsed.id,
      };
    },
  };
}

/** Keys disabled (no DATABASE_URL outside production, research R10): no key exists. */
export const disabledVerifier: KeyVerifier = { verify: async () => INVALID };
