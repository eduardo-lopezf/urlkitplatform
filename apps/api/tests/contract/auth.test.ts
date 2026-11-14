/**
 * API keys on /v1 (003/T018, contracts/api-auth.md). Runs on MemoryKeyStore; the PostgreSQL store
 * has the same behaviour (tests/integration/key-store.test.ts).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { generateKey, hashSecret } from '../../src/auth/key-format.ts';
import { MemoryKeyStore } from '../../src/auth/key-store.ts';
import { createKeyVerifier } from '../../src/auth/verify.ts';
import { post, T0, testApp } from '../helpers.ts';

const URL_IN = 'https://ejemplo.com/?utm_source=x&id=1';
const TOOLS: Array<[string, unknown]> = [
  ['/v1/clean', { url: URL_IN }],
  ['/v1/parse', { url: URL_IN }],
  ['/v1/diff', { a: URL_IN, b: 'https://ejemplo.com/?id=1' }],
  ['/v1/explain', { url: URL_IN }],
  ['/v1/inspect', { url: URL_IN }],
  ['/v1/headers', { url: URL_IN }],
  ['/v1/metadata', { url: URL_IN }],
  ['/v1/tls', { target: 'ejemplo.com' }],
  ['/v1/dns', { target: 'ejemplo.com' }],
  ['/v1/security', { url: URL_IN }],
];
const AUTH_INVALID = { code: 'auth.invalid', message: { code: 'auth.invalid' } };

async function setup() {
  let now = T0;
  const store = new MemoryKeyStore(() => now);
  const org = await store.createOrganization({ name: 'Acme', planId: 'organization' });
  const issue = async (organizationId = org.id) => {
    const key = generateKey();
    await store.createKey(organizationId, key.id, hashSecret(key.secret));
    return key.key;
  };
  const keyVerifier = createKeyVerifier({ store, now: () => now });
  const harness = testApp({ keyVerifier });
  harness.clock.set(T0);
  return { ...harness, store, org, issue, tick: (ms: number) => (now += ms) };
}

describe('API keys on /v1 (003)', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
  });

  it('answers every tool endpoint with a valid key as without it (FR-010)', async () => {
    const key = await t.issue();
    for (const [path, body] of TOOLS) {
      const anonymous = await post(t.app, path, body, { 'x-test-ip': '198.51.100.1' });
      const keyed = await post(t.app, path, body, { authorization: `Bearer ${key}` });
      expect(keyed.status, path).toBe(anonymous.status);
      expect(Object.keys((await keyed.json()) as object).sort(), path).toEqual(
        Object.keys((await anonymous.json()) as object).sort(),
      );
      expect(keyed.headers.get('RateLimit-Limit'), path).not.toBeNull();
    }
  });

  it('rejects every bad header with the same 401 body and WWW-Authenticate (FR-012)', async () => {
    const good = await t.issue();
    const revoked = await t.issue();
    await t.store.revokeKey(revoked.split('_')[1] ?? '');
    const other = await t.store.createOrganization({ name: 'Off', planId: 'organization' });
    const inactive = await t.issue(other.id);
    await t.store.setStatus(other.id, 'inactive');
    const headers = [
      '',
      `Basic ${good}`,
      'Bearer not-a-key',
      `Bearer ${generateKey().key}`,
      `Bearer ${revoked}`,
      `Bearer ${inactive}`,
    ];
    for (const [i, header] of headers.entries()) {
      const res = await post(
        t.app,
        '/v1/clean',
        { url: URL_IN },
        {
          authorization: header,
          'x-test-ip': `198.51.100.${10 + i}`,
        },
      );
      expect(res.status, header).toBe(401);
      expect(res.headers.get('WWW-Authenticate'), header).toBe('Bearer');
      expect(await res.json(), header).toEqual(AUTH_INVALID);
    }
  });

  it('charges each 401 to the anonymous quota of the sender (FR-027)', async () => {
    const headers = { authorization: 'Bearer not-a-key', 'x-test-ip': '198.51.100.50' };
    for (let i = 0; i < 10; i++)
      expect((await post(t.app, '/v1/inspect', { url: URL_IN }, headers)).status).toBe(401);
    const blocked = await post(t.app, '/v1/inspect', { url: URL_IN }, headers);
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { code: string }).code).toBe('quota.exceeded');
    // The same sender without the header shares that anonymous quota.
    const anonymous = await post(
      t.app,
      '/v1/inspect',
      { url: URL_IN },
      { 'x-test-ip': '198.51.100.50' },
    );
    expect(anonymous.status).toBe(429);
  });

  it('answers 503 auth.unavailable when the store fails, and 200 without a header (FR-043)', async () => {
    const key = await t.issue();
    t.store.failing = true;
    const res = await post(t.app, '/v1/clean', { url: URL_IN }, { authorization: `Bearer ${key}` });
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(await res.json()).toEqual({
      code: 'auth.unavailable',
      message: { code: 'auth.unavailable' },
    });
    expect((await post(t.app, '/v1/clean', { url: URL_IN })).status).toBe(200);
  });

  it('ignores the header on /v1/metrics/events', async () => {
    const res = await post(
      t.app,
      '/v1/metrics/events',
      { tool: 'clean', outcome: 'success' },
      {
        authorization: 'Bearer not-a-key',
      },
    );
    expect(res.status).toBe(204);
  });

  describe('US2: limits of the organization plan (FR-023, FR-024, FR-026)', () => {
    it('shows the plan limits in RateLimit-*', async () => {
      const key = await t.issue();
      const res = await post(
        t.app,
        '/v1/inspect',
        { url: URL_IN },
        { authorization: `Bearer ${key}` },
      );
      expect(res.headers.get('RateLimit-Limit')).toBe('100');
      expect(res.headers.get('RateLimit-Remaining')).toBe('99');
    });

    it('adds up two keys of one organization against the same counters (FR-005)', async () => {
      const a = await t.issue();
      const b = await t.issue();
      for (let i = 0; i < 100; i++) {
        const key = i % 2 ? a : b;
        expect(
          (await post(t.app, '/v1/inspect', { url: URL_IN }, { authorization: `Bearer ${key}` }))
            .status,
        ).toBe(200);
      }
      for (const key of [a, b]) {
        const res = await post(
          t.app,
          '/v1/inspect',
          { url: URL_IN },
          { authorization: `Bearer ${key}` },
        );
        expect(res.status).toBe(429);
        expect(res.headers.get('Retry-After')).not.toBeNull();
      }
      // Other buckets still answer, and anonymous use is not affected.
      expect(
        (await post(t.app, '/v1/headers', { url: URL_IN }, { authorization: `Bearer ${a}` }))
          .status,
      ).toBe(200);
      expect(
        (await post(t.app, '/v1/inspect', { url: URL_IN }, { 'x-test-ip': '198.51.100.99' }))
          .status,
      ).toBe(200);
    });

    it('does not let anonymous use spend the organization quota', async () => {
      const key = await t.issue();
      for (let i = 0; i < 10; i++)
        await post(t.app, '/v1/inspect', { url: URL_IN }, { 'x-test-ip': '198.51.100.98' });
      expect(
        (await post(t.app, '/v1/inspect', { url: URL_IN }, { 'x-test-ip': '198.51.100.98' }))
          .status,
      ).toBe(429);
      const keyed = await post(
        t.app,
        '/v1/inspect',
        { url: URL_IN },
        { authorization: `Bearer ${key}`, 'x-test-ip': '198.51.100.98' },
      );
      expect(keyed.status).toBe(200);
      expect(keyed.headers.get('RateLimit-Remaining')).toBe('99');
    });
  });
});
