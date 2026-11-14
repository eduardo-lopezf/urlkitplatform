/**
 * API key format (003, research R2): `uk_<id>_<secret>`.
 * - `id`: 12 characters of lower-case Crockford base32 (no i, l, o, u), public and non-secret.
 * - `secret`: 32 random bytes in base64url (43 characters). Only its SHA-256 is stored.
 * The `uk_` prefix lets secret scanners recognise a leaked key.
 */
import { createHash, randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const KEY = /^uk_([0-9a-hjkmnp-tv-z]{12})_([A-Za-z0-9_-]{43})$/;

function crockford(length: number): string {
  // 32 symbols: the low 5 bits of each random byte are uniform.
  return Array.from(randomBytes(length), (byte) => ALPHABET[byte & 31]).join('');
}

export function generateKey(): { key: string; id: string; secret: string } {
  const id = crockford(12);
  const secret = randomBytes(32).toString('base64url');
  return { key: `uk_${id}_${secret}`, id, secret };
}

export function parseKey(key: string): { id: string; secret: string } | null {
  const match = KEY.exec(key);
  return match?.[1] && match[2] ? { id: match[1], secret: match[2] } : null;
}

/** A fast hash is enough: the secret has 256 bits of entropy (research R2). */
export function hashSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}
