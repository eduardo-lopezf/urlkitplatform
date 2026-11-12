/** Generic client of the server-side tools (002/T013). */
import { describe, expect, it } from 'vitest';
import { callTool, inspect } from '../../src/lib/api.ts';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const RATE = { 'RateLimit-Limit': '10', 'RateLimit-Remaining': '9', 'RateLimit-Reset': '120' };
const URL_IN = 'https://example.com/secret-path?token=abc';

describe('callTool', () => {
  it('posts the input only in the JSON body, without credentials or referrer', async () => {
    const { impl, calls } = fakeFetch(200, { input: URL_IN }, RATE);
    const outcome = await callTool('headers', { url: URL_IN }, impl);
    expect(outcome).toMatchObject({
      kind: 'ok',
      value: { input: URL_IN },
      rate: { limit: 10, remaining: 9, resetSeconds: 120 },
    });
    const [call] = calls;
    expect(call?.url).toMatch(/\/v1\/headers$/);
    expect(call?.url).not.toContain('example.com');
    expect(call?.init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      body: JSON.stringify({ url: URL_IN }),
    });
  });

  it('reports quota with the Retry-After seconds', async () => {
    const { impl } = fakeFetch(
      429,
      { code: 'quota.exceeded', message: { code: 'quota.exceeded' } },
      {
        ...RATE,
        'Retry-After': '1800',
      },
    );
    expect(await callTool('headers', { url: URL_IN }, impl)).toMatchObject({
      kind: 'quota',
      retryAfterSeconds: 1800,
    });
  });

  it('reports an invalid input with its ToolError', async () => {
    const error = { code: 'url.invalid', message: { code: 'url.invalid' }, part: 'host' };
    const { impl } = fakeFetch(400, error);
    expect(await callTool('headers', { url: 'x' }, impl)).toEqual({ kind: 'invalid', error });
  });

  it('reports 503 as unavailable', async () => {
    const error = { code: 'dns.unavailable', message: { code: 'dns.unavailable' } };
    const { impl } = fakeFetch(503, error);
    expect(await callTool('headers', { url: URL_IN }, impl)).toMatchObject({
      kind: 'unavailable',
      error,
    });
  });

  it('reports a failed request as network', async () => {
    const impl = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await callTool('headers', { url: URL_IN }, impl)).toEqual({ kind: 'network' });
  });
});

describe('inspect (unchanged behavior)', () => {
  it('still returns the chain under `chain`', async () => {
    const chain = { input: URL_IN, hops: [], final: null, stopReason: 'final', totalMs: 1 };
    const { impl, calls } = fakeFetch(200, chain, RATE);
    expect(await inspect(URL_IN, impl)).toMatchObject({ kind: 'ok', chain });
    expect(calls[0]?.url).toMatch(/\/v1\/inspect$/);
  });

  it('still maps 429 and 400', async () => {
    expect(await inspect(URL_IN, fakeFetch(429, {}, { 'Retry-After': '60' }).impl)).toMatchObject({
      kind: 'quota',
      retryAfterSeconds: 60,
    });
    expect(await inspect(URL_IN, fakeFetch(400, { code: 'url.invalid' }).impl)).toMatchObject({
      kind: 'invalid',
    });
  });
});
