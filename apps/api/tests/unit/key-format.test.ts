/** Format of API keys (003/T015, research R2). */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateKey, hashSecret, parseKey } from '../../src/auth/key-format.ts';

const SHAPE = /^uk_[0-9a-hjkmnp-tv-z]{12}_[A-Za-z0-9_-]{43}$/;

describe('API key format', () => {
  it('generates uk_ + 12 Crockford base32 characters + _ + 43 base64url characters', () => {
    const { key, id, secret } = generateKey();
    expect(key).toMatch(SHAPE);
    expect(key).toBe(`uk_${id}_${secret}`);
  });

  it('never repeats a key or an id', () => {
    const keys = Array.from({ length: 2000 }, () => generateKey());
    expect(new Set(keys.map((k) => k.key)).size).toBe(2000);
    expect(new Set(keys.map((k) => k.id)).size).toBe(2000);
  });

  it('parses a key into its id and secret', () => {
    const { key, id, secret } = generateKey();
    expect(parseKey(key)).toEqual({ id, secret });
  });

  it('rejects any other shape', () => {
    const { id, secret } = generateKey();
    for (const bad of [
      '',
      'uk_',
      `xx_${id}_${secret}`,
      `uk_${id}`,
      `uk_${id.slice(1)}_${secret}`,
      `uk_${id}_${secret.slice(1)}`,
      `uk_${id}_${secret}_extra`,
      `uk_${id.toUpperCase()}_${secret}`,
      `uk_${id.replace(/./, 'l')}_${secret}`, // 'l' is not in the alphabet
      ` uk_${id}_${secret}`,
    ])
      expect(parseKey(bad), bad).toBeNull();
  });

  it('stores the SHA-256 of the secret, never the secret', () => {
    const { secret } = generateKey();
    const hash = hashSecret(secret);
    expect(hash).toHaveLength(32);
    expect(hash.equals(createHash('sha256').update(secret).digest())).toBe(true);
    expect(hash.toString('latin1')).not.toContain(secret);
  });
});
