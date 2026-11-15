/** Optional retries (004/T016, FR-030–FR-033, SC-006). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, type RetryOptions } from '../src/index.ts';

const BODY = { url: 'https://ejemplo.com/' };
const error = (status: number, code: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ code, message: { code } }), { status, headers });
const ok = () => new Response(JSON.stringify({ output: 'https://ejemplo.com/' }), { status: 200 });

/** A fetch that answers with the given responses in order and counts the calls. */
function sequence(...responses: Array<() => Response>) {
  let calls = 0;
  const fetch = vi.fn(async () => {
    const next = responses[Math.min(calls, responses.length - 1)];
    calls++;
    return next!();
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, count: () => calls };
}

const client = (fetch: typeof globalThis.fetch, retries?: RetryOptions) =>
  createClient({ fetch, ...(retries ? { retries } : {}) });

describe('retries (004)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not retry unless asked (FR-030)', async () => {
    for (const status of [429, 503]) {
      const f = sequence(() => error(status, 'quota.exceeded', { 'Retry-After': '1' }), ok);
      await expect(client(f.fetch).cleanUrl(BODY)).rejects.toMatchObject({ status });
      expect(f.count()).toBe(1);
    }
  });

  it('waits Retry-After and retries 429 and 503 up to maxAttempts (FR-031, SC-006)', async () => {
    const f = sequence(() => error(503, 'auth.unavailable', { 'Retry-After': '2' }), ok);
    const pending = client(f.fetch, {}).cleanUrl(BODY);
    await vi.advanceTimersByTimeAsync(1999);
    expect(f.count()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ data: { output: 'https://ejemplo.com/' } });
    expect(f.count()).toBe(2);

    const always = sequence(() => error(429, 'quota.exceeded', { 'Retry-After': '1' }));
    const failing = client(always.fetch, { maxAttempts: 3 }).cleanUrl(BODY);
    const outcome = expect(failing).rejects.toMatchObject({ code: 'quota.exceeded' });
    await vi.advanceTimersByTimeAsync(5000);
    await outcome;
    expect(always.count()).toBe(3);
  });

  it('waits 1 s when Retry-After is missing', async () => {
    const f = sequence(() => error(503, 'auth.unavailable'), ok);
    const pending = client(f.fetch, {}).cleanUrl(BODY);
    await vi.advanceTimersByTimeAsync(999);
    expect(f.count()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(f.count()).toBe(2);
  });

  it('fails at once when the wait exceeds maxWaitSeconds (FR-033)', async () => {
    const f = sequence(() => error(429, 'quota.exceeded', { 'Retry-After': '3600' }), ok);
    await expect(client(f.fetch, { maxWaitSeconds: 60 }).cleanUrl(BODY)).rejects.toMatchObject({
      code: 'quota.exceeded',
    });
    expect(f.count()).toBe(1);
  });

  it('never retries 401, other 4xx or transport errors (FR-032)', async () => {
    for (const status of [401, 400, 403, 404]) {
      const f = sequence(() => error(status, 'auth.invalid'), ok);
      await expect(client(f.fetch, { maxAttempts: 5 }).cleanUrl(BODY)).rejects.toMatchObject({
        status,
      });
      expect(f.count()).toBe(1);
    }
    let calls = 0;
    const broken = (async () => {
      calls++;
      throw new TypeError('fetch failed');
    }) as unknown as typeof globalThis.fetch;
    await expect(client(broken, { maxAttempts: 5 }).cleanUrl(BODY)).rejects.toMatchObject({
      kind: 'network',
    });
    expect(calls).toBe(1);
  });

  it('stops waiting when the call is aborted, with no further request', async () => {
    const f = sequence(() => error(429, 'quota.exceeded', { 'Retry-After': '10' }), ok);
    const controller = new AbortController();
    const pending = client(f.fetch, {}).cleanUrl(BODY, { signal: controller.signal });
    const outcome = expect(pending).rejects.toMatchObject({
      name: 'UrlkitTransportError',
      kind: 'aborted',
    });
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await outcome;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(f.count()).toBe(1);
  });
});
