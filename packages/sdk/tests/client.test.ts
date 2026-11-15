/** The client: typed calls with or without a key (004/T005, T007, FR-001–FR-005). */
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createClient, DEFAULT_BASE_URL } from '../src/index.ts';

const KEY = 'uk_abcdefghjkmn_' + 'S'.repeat(43);

/** A fetch that records every call and answers 200 with rate-limit headers. */
function fakeFetch(body: unknown = { ok: true }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'RateLimit-Limit': '600',
        'RateLimit-Remaining': '599',
        'RateLimit-Reset': '120',
      },
    });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name);

describe('createClient', () => {
  it('sends the key as Bearer, and nothing without it (FR-002)', async () => {
    const keyed = fakeFetch();
    await createClient({ apiKey: KEY, fetch: keyed.fetch }).cleanUrl({ url: 'https://a.example/' });
    expect(header(keyed.calls[0]!.init, 'authorization')).toBe(`Bearer ${KEY}`);
    const anonymous = fakeFetch();
    await createClient({ fetch: anonymous.fetch }).cleanUrl({ url: 'https://a.example/' });
    expect(header(anonymous.calls[0]!.init, 'authorization')).toBeNull();
  });

  it('posts the JSON body to the base URL and path, default from the contract (FR-003)', async () => {
    const f = fakeFetch();
    await createClient({ fetch: f.fetch }).diffUrls({
      a: 'https://a.example/',
      b: 'https://b.example/',
    });
    expect(f.calls[0]!.url).toBe(`${DEFAULT_BASE_URL}/diff`);
    expect(f.calls[0]!.init.method).toBe('POST');
    expect(header(f.calls[0]!.init, 'content-type')).toBe('application/json');
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({
      a: 'https://a.example/',
      b: 'https://b.example/',
    });
    const local = fakeFetch();
    await createClient({ baseUrl: 'http://localhost:8787/v1/', fetch: local.fetch }).parseUrl({
      url: 'https://a.example/',
    });
    expect(local.calls[0]!.url).toBe('http://localhost:8787/v1/parse');
  });

  it('adds ?lang only where the contract declares it', async () => {
    const f = fakeFetch();
    const client = createClient({ fetch: f.fetch });
    await client.explainUrl({ url: 'https://a.example/' }, { lang: 'en' });
    await client.explainUrl({ url: 'https://a.example/' });
    expect(f.calls.map((c) => new URL(c.url).search)).toEqual(['?lang=en', '']);
  });

  it('passes the cancellation signal to fetch (FR-004)', async () => {
    const f = fakeFetch();
    const controller = new AbortController();
    await createClient({ fetch: f.fetch }).cleanUrl(
      { url: 'https://a.example/' },
      { signal: controller.signal },
    );
    expect(f.calls[0]!.init.signal).toBe(controller.signal);
  });

  it('resolves to data and rate limit', async () => {
    const f = fakeFetch({ output: 'https://a.example/' });
    const res = await createClient({ fetch: f.fetch }).cleanUrl({ url: 'https://a.example/' });
    expect(res).toEqual({
      data: { output: 'https://a.example/' },
      rateLimit: { limit: 600, remaining: 599, resetSeconds: 120 },
    });
  });

  it('makes exactly the requests asked for, and none at creation (FR-005, SC-004)', async () => {
    const f = fakeFetch();
    const client = createClient({ apiKey: KEY, fetch: f.fetch });
    expect(f.calls).toHaveLength(0);
    await client.cleanUrl({ url: 'https://a.example/' });
    await client.lookupDns({ target: 'a.example' });
    expect(f.calls).toHaveLength(2);
  });

  it('types each method from the contract (scenario 4)', () => {
    const client = createClient({ fetch: fakeFetch().fetch });
    expectTypeOf(client.cleanUrl).parameter(0).toHaveProperty('url');
    // @ts-expect-error: `url` is required.
    void client.cleanUrl({});
    // @ts-expect-error: `target` must be a string.
    void client.analyzeTls({ target: 42 });
    // @ts-expect-error: cleanUrl does not accept `lang`.
    void client.cleanUrl({ url: 'https://a.example/' }, { lang: 'en' });
  });
});
