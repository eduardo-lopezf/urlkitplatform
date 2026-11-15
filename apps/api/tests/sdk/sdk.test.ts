/**
 * Consumer side of the contract (004/T006, T011, FR-023): the SDK against the real API, in
 * process through `app.request`. It lives in apps/api because packages may not import apps
 * (.dependency-cruiser.cjs); an app may use a package.
 */
import { createClient, UrlkitApiError } from '@urlkit/sdk';
import { describe, expect, it } from 'vitest';
import { generateKey, hashSecret } from '../../src/auth/key-format.ts';
import { MemoryKeyStore } from '../../src/auth/key-store.ts';
import { createKeyVerifier } from '../../src/auth/verify.ts';
import { T0, testApp } from '../helpers.ts';

const URL_IN = 'https://ejemplo.com/?utm_source=x&id=1';

async function setup() {
  const store = new MemoryKeyStore(() => T0);
  const org = await store.createOrganization({ name: 'Acme', planId: 'organization' });
  const key = generateKey();
  await store.createKey(org.id, key.id, hashSecret(key.secret));
  const { app } = testApp({ keyVerifier: createKeyVerifier({ store, now: () => T0 }) });
  const fetch = ((input: string | URL | Request, init?: RequestInit) =>
    app.request(String(input), init)) as typeof globalThis.fetch;
  const client = (apiKey?: string) =>
    createClient({ baseUrl: 'http://localhost/v1', fetch, ...(apiKey ? { apiKey } : {}) });
  return { store, key, client };
}

describe('SDK against the real API (004)', () => {
  it('calls the ten tools without a key and with one (FR-001, FR-023)', async () => {
    const { key, client } = await setup();
    for (const urlkit of [client(), client(key.key)]) {
      expect((await urlkit.cleanUrl({ url: URL_IN })).data.output).toBe(
        'https://ejemplo.com/?id=1',
      );
      expect((await urlkit.parseUrl({ url: URL_IN })).data.host).toMatchObject({
        ascii: 'ejemplo.com',
      });
      expect(
        (await urlkit.diffUrls({ a: URL_IN, b: 'https://ejemplo.com/?id=1' })).data,
      ).toHaveProperty('equivalent');
      expect((await urlkit.explainUrl({ url: URL_IN }, { lang: 'en' })).data).toHaveProperty(
        'parts',
      );
      expect((await urlkit.inspectRedirects({ url: URL_IN })).data).toHaveProperty('hops');
      expect((await urlkit.analyzeHeaders({ url: URL_IN })).data).toHaveProperty('security');
      expect((await urlkit.extractMetadata({ url: URL_IN })).data).toHaveProperty('effective');
      expect((await urlkit.analyzeTls({ target: 'ejemplo.com' })).data).toHaveProperty('host');
      expect((await urlkit.reviewSecurity({ url: URL_IN })).data).toHaveProperty('findings');
      // The test DoH resolver is stubbed as unavailable: lookupDns surfaces the contract's 503.
      await expect(urlkit.lookupDns({ target: 'ejemplo.com' })).rejects.toMatchObject({
        code: 'dns.unavailable',
        status: 503,
      });
    }
  });

  it('turns the real API errors into typed errors (004/T011)', async () => {
    const { store, key, client } = await setup();
    await expect(
      client('uk_' + 'a'.repeat(12) + '_' + 'B'.repeat(43)).cleanUrl({ url: URL_IN }),
    ).rejects.toMatchObject({
      name: 'UrlkitApiError',
      code: 'auth.invalid',
      status: 401,
    });
    const anonymous = client();
    for (let i = 0; i < 10; i++) await anonymous.inspectRedirects({ url: URL_IN });
    const quota = await anonymous.inspectRedirects({ url: URL_IN }).catch((e: unknown) => e);
    expect(quota).toBeInstanceOf(UrlkitApiError);
    expect(quota).toMatchObject({ code: 'quota.exceeded', status: 429 });
    expect((quota as UrlkitApiError).retryAfterSeconds).toBeGreaterThan(0);
    expect((await client(key.key).cleanUrl({ url: URL_IN })).rateLimit?.limit).toBe(6000);
    expect((await anonymous.cleanUrl({ url: URL_IN })).rateLimit?.limit).toBe(600);
    const fresh = generateKey();
    const org = await store.findOrganization('Acme');
    await store.createKey(org?.id ?? '', fresh.id, hashSecret(fresh.secret));
    store.failing = true;
    await expect(client(fresh.key).cleanUrl({ url: URL_IN })).rejects.toMatchObject({
      code: 'auth.unavailable',
      status: 503,
      retryAfterSeconds: 30,
    });
  });
});
