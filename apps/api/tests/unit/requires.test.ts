/** A suite that needs a service fails in CI instead of being skipped silently. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { skipUnless } from '../requires.ts';

describe('skipUnless', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('skips outside CI when the service is missing, and runs when it is there', () => {
    vi.stubEnv('CI', '');
    expect(skipUnless(false, 'DATABASE_URL')).toBe(true);
    expect(skipUnless(true, 'DATABASE_URL')).toBe(false);
  });

  it('fails in CI when the service is missing', () => {
    vi.stubEnv('CI', 'true');
    expect(() => skipUnless(false, 'DATABASE_URL')).toThrow(/DATABASE_URL/);
    expect(skipUnless(true, 'DATABASE_URL')).toBe(false);
  });
});
