import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseUrl } from '../../src/index.ts';

interface Vector {
  input: string;
  base: string | null;
  failure?: true;
  href?: string;
  protocol?: string;
  username?: string;
  password?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  hash?: string;
}

const raw: unknown[] = JSON.parse(
  readFileSync(new URL('../vectors/urltestdata.json', import.meta.url), 'utf8'),
);
const vectors = raw.filter((entry): entry is Vector => typeof entry === 'object');

/**
 * Inputs where the native `URL` of the current Node LTS (Ada) still lags the standard: hosts with
 * Punycode labels that are not valid Punycode, which the standard now accepts and Ada rejects.
 * parseUrl returns an explicit `url.invalid` for them, never a wrong result (Principio II). The
 * test asserts they still diverge, so it fails as soon as the platform is fixed and the entry
 * can be removed. Documented in research.md (R2) as an FR-022 divergence.
 */
const KNOWN_PLATFORM_DIVERGENCES = new Set([
  'http://a.b.c.xn--pokxncvks',
  'http://a.b.c.XN--pokxncvks',
  'http://a.b.c.Xn--pokxncvks',
  'http://10.0.0.xn--pokxncvks',
  'http://10.0.0.XN--pokxncvks',
  'http://10.0.0.xN--pokxncvks',
  'file://xn--/p',
  'https://xn--/',
]);

describe('parseUrl matches the WHATWG URL Standard (WPT urltestdata.json)', () => {
  it('loads the vectors', () => {
    expect(vectors.length).toBeGreaterThan(800);
  });

  it('keeps the list of known platform divergences short and real', () => {
    const inputs = new Set(vectors.map((v) => v.input));
    for (const input of KNOWN_PLATFORM_DIVERGENCES) expect(inputs.has(input)).toBe(true);
    expect(KNOWN_PLATFORM_DIVERGENCES.size).toBeLessThanOrEqual(10);
  });

  it.each(vectors.map((v, i) => [i, v] as const))('vector %i', (_i, v) => {
    const result = parseUrl(v.input, { standard: true, ...(v.base ? { base: v.base } : {}) });
    if (KNOWN_PLATFORM_DIVERGENCES.has(v.input)) {
      expect(result.ok, 'platform fixed: remove it from KNOWN_PLATFORM_DIVERGENCES').toBe(false);
      if (!result.ok) expect(result.error.code).toBe('url.invalid');
      return;
    }
    if (v.failure) {
      expect(result.ok).toBe(false);
      return;
    }
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const url = result.value;
    expect(url.href).toBe(v.href);
    expect(url.scheme).toBe(v.protocol?.slice(0, -1));
    expect(url.username).toBe(v.username);
    expect(url.password).toBe(v.password);
    expect(url.host.ascii).toBe(v.hostname);
    expect(url.path.raw).toBe(v.pathname);
    if (v.port === '') expect(url.port.isDefault).toBe(true);
    else expect(url.port.value).toBe(Number(v.port));
    if (v.hash) expect(url.fragment).toBe(v.hash.slice(1));
  });
});
