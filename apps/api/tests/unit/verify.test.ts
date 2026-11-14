/** Verification of API keys with its cache (003/T016, research R3 and R8). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as crypto from 'node:crypto';
import { generateKey, hashSecret } from '../../src/auth/key-format.ts';
import { MemoryKeyStore } from '../../src/auth/key-store.ts';
import { createKeyVerifier } from '../../src/auth/verify.ts';

vi.mock('node:crypto', async (original) => {
  const real = await original<typeof import('node:crypto')>();
  return { ...real, timingSafeEqual: vi.fn(real.timingSafeEqual) };
});

const T0 = Date.UTC(2026, 10, 13, 10, 0, 0);

describe('API key verification', () => {
  let now: number;
  let store: MemoryKeyStore;
  let orgId: string;

  async function issue(organizationId = orgId) {
    const key = generateKey();
    await store.createKey(organizationId, key.id, hashSecret(key.secret));
    return key;
  }

  beforeEach(async () => {
    now = T0;
    store = new MemoryKeyStore(() => now);
    orgId = (await store.createOrganization({ name: 'Acme', planId: 'organization' })).id;
  });

  const verifier = () => createKeyVerifier({ store, now: () => now });

  it('resolves a valid key to its organization, plan and key id', async () => {
    const key = await issue();
    expect(await verifier().verify(`Bearer ${key.key}`)).toEqual({
      kind: 'valid',
      organizationId: orgId,
      planId: 'organization',
      keyId: key.id,
    });
  });

  it('gives the same invalid result for every bad case (FR-012)', async () => {
    const v = verifier();
    const good = await issue();
    const revoked = await issue();
    await store.revokeKey(revoked.id);
    const other = await store.createOrganization({ name: 'Off', planId: 'organization' });
    const inactive = await issue(other.id);
    await store.setStatus(other.id, 'inactive');
    const unknown = generateKey();
    for (const header of [
      '',
      'Bearer',
      'Bearer ',
      `Basic ${good.key}`,
      'Bearer not-a-key',
      `Bearer ${unknown.key}`,
      `Bearer uk_${good.id}_${unknown.secret}`, // right id, wrong secret
      `Bearer ${revoked.key}`,
      `Bearer ${inactive.key}`,
    ])
      expect(await v.verify(header), header).toEqual({ kind: 'invalid' });
  });

  it('accepts the scheme in any case (RFC 7235)', async () => {
    const key = await issue();
    expect((await verifier().verify(`bearer ${key.key}`)).kind).toBe('valid');
  });

  it('compares the secret in constant time', async () => {
    const key = await issue();
    vi.mocked(crypto.timingSafeEqual).mockClear();
    await verifier().verify(`Bearer ${key.key}`);
    expect(crypto.timingSafeEqual).toHaveBeenCalled();
  });

  it('caches valid and invalid results for 30 s, then reads the store again', async () => {
    const v = verifier();
    const key = await issue();
    const unknown = generateKey();
    const find = vi.spyOn(store, 'findKey');
    await v.verify(`Bearer ${key.key}`);
    await v.verify(`Bearer ${unknown.key}`);
    await v.verify(`Bearer ${key.key}`);
    await v.verify(`Bearer ${unknown.key}`);
    expect(find).toHaveBeenCalledTimes(2);
    await store.revokeKey(key.id);
    now += 29_000;
    expect((await v.verify(`Bearer ${key.key}`)).kind).toBe('valid'); // still cached
    now += 2_000;
    expect((await v.verify(`Bearer ${key.key}`)).kind).toBe('invalid'); // revocation seen
    expect(find).toHaveBeenCalledTimes(3);
  });

  it('never keeps more than its maximum number of entries', async () => {
    const v = createKeyVerifier({ store, now: () => now, maxEntries: 3 });
    const find = vi.spyOn(store, 'findKey');
    const keys = [await issue(), await issue(), await issue(), await issue()];
    for (const k of keys) await v.verify(`Bearer ${k.key}`);
    await v.verify(`Bearer ${keys[0]?.key}`); // evicted: read again
    await v.verify(`Bearer ${keys[3]?.key}`); // kept
    expect(find).toHaveBeenCalledTimes(5);
  });

  it('answers unavailable when the store fails, unless the key is still cached', async () => {
    const v = verifier();
    const cached = await issue();
    const fresh = await issue();
    await v.verify(`Bearer ${cached.key}`);
    store.failing = true;
    expect((await v.verify(`Bearer ${cached.key}`)).kind).toBe('valid');
    expect(await v.verify(`Bearer ${fresh.key}`)).toEqual({ kind: 'unavailable' });
    expect(await v.verify('Bearer not-a-key')).toEqual({ kind: 'invalid' }); // no store call
  });
});
