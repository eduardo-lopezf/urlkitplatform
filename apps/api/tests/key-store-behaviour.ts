/**
 * Behaviour every KeyStore must have (003/T017). Run against MemoryKeyStore in the unit suite
 * and against PostgreSQL in the integration suite, so both stay interchangeable.
 */
import { expect, it } from 'vitest';
import { generateKey, hashSecret } from '../src/auth/key-format.ts';
import { DuplicateNameError, type KeyStore } from '../src/auth/key-store.ts';

export function keyStoreBehaviour(make: () => Promise<KeyStore>) {
  it('creates, finds and lists organizations', async () => {
    const store = await make();
    const org = await store.createOrganization({ name: 'Acme', planId: 'organization', note: 'x' });
    expect(org).toMatchObject({
      name: 'Acme',
      planId: 'organization',
      note: 'x',
      status: 'active',
    });
    expect(await store.findOrganization(org.id)).toMatchObject({ id: org.id });
    expect(await store.findOrganization('Acme')).toMatchObject({ id: org.id });
    expect(await store.findOrganization('nobody')).toBeNull();
    await expect(store.createOrganization({ name: 'ACME', planId: 'p' })).rejects.toBeInstanceOf(
      DuplicateNameError,
    );
  });

  it('stores only the hash of a key and finds it with its organization', async () => {
    const store = await make();
    const org = await store.createOrganization({ name: 'Keys', planId: 'organization' });
    const key = generateKey();
    const created = await store.createKey(org.id, key.id, hashSecret(key.secret));
    expect(created).toMatchObject({ id: key.id, organizationId: org.id, revokedAt: null });
    const found = await store.findKey(key.id);
    expect(found).toMatchObject({
      id: key.id,
      organizationId: org.id,
      organizationStatus: 'active',
      planId: 'organization',
      revokedAt: null,
    });
    expect(found?.secretHash.equals(hashSecret(key.secret))).toBe(true);
    expect(await store.findKey(generateKey().id)).toBeNull();
    expect((await store.listKeys(org.id)).map((k) => k.id)).toEqual([key.id]);
    expect(JSON.stringify(await store.listKeys(org.id))).not.toContain(key.secret);
  });

  it('revokes for good, keeping the first date', async () => {
    const store = await make();
    const org = await store.createOrganization({ name: 'Rev', planId: 'organization' });
    const key = generateKey();
    await store.createKey(org.id, key.id, hashSecret(key.secret));
    const first = await store.revokeKey(key.id);
    expect(first?.revokedAt).toBeInstanceOf(Date);
    const again = await store.revokeKey(key.id);
    expect(again?.revokedAt?.getTime()).toBe(first?.revokedAt?.getTime());
    expect(await store.revokeKey(generateKey().id)).toBeNull();
  });

  it('changes plan and status, and counts active keys', async () => {
    const store = await make();
    const org = await store.createOrganization({ name: 'State', planId: 'organization' });
    const a = generateKey();
    const b = generateKey();
    await store.createKey(org.id, a.id, hashSecret(a.secret));
    await store.createKey(org.id, b.id, hashSecret(b.secret));
    await store.revokeKey(b.id);
    await store.setPlan(org.id, 'anonymous');
    expect((await store.findKey(a.id))?.planId).toBe('anonymous');
    await store.setStatus(org.id, 'inactive');
    expect((await store.findKey(a.id))?.organizationStatus).toBe('inactive');
    expect(await store.listOrganizations()).toEqual([]);
    const all = await store.listOrganizations({ all: true });
    expect(all).toMatchObject([{ id: org.id, status: 'inactive', activeKeys: 1 }]);
    await store.setStatus(org.id, 'active');
    expect((await store.findOrganization(org.id))?.deactivatedAt).toBeNull();
  });
}
