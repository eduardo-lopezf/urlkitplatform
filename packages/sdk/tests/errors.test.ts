/** Errors and rate limits (004/T010, FR-010–FR-014, SC-005). */
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createClient, UrlkitApiError, UrlkitTransportError } from '../src/index.ts';

const KEY = 'uk_abcdefghjkmn_' + 'S'.repeat(43);
const BODY = { url: 'https://ejemplo.com/secret-path?utm_source=x' };

const respond =
  (status: number, body: unknown, headers: Record<string, string> = {}) =>
  async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });

const client = (fetch: () => Promise<Response>) =>
  createClient({ apiKey: KEY, fetch: fetch as unknown as typeof globalThis.fetch });

async function failure(fetch: () => Promise<Response>) {
  try {
    await client(fetch).cleanUrl(BODY);
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected a failure');
}

const LIMITS = { 'RateLimit-Limit': '10', 'RateLimit-Remaining': '0', 'RateLimit-Reset': '30' };

describe('errors (004)', () => {
  it('turns a contract error into UrlkitApiError with code, status and rate limit (FR-010)', async () => {
    const error = await failure(
      respond(401, { code: 'auth.invalid', message: { code: 'auth.invalid' } }, LIMITS),
    );
    expect(error).toBeInstanceOf(UrlkitApiError);
    expect(error).toMatchObject({
      code: 'auth.invalid',
      status: 401,
      retryAfterSeconds: undefined,
      rateLimit: { limit: 10, remaining: 0, resetSeconds: 30 },
    });
  });

  it('carries the wait of quota.exceeded and auth.unavailable (FR-011)', async () => {
    const quota = await failure(
      respond(429, {
        code: 'quota.exceeded',
        message: { code: 'quota.exceeded' },
        retryAfterSeconds: 120,
      }),
    );
    expect(quota).toMatchObject({ code: 'quota.exceeded', retryAfterSeconds: 120 });
    const unavailable = await failure(
      respond(
        503,
        { code: 'auth.unavailable', message: { code: 'auth.unavailable' } },
        { 'Retry-After': '30' },
      ),
    );
    expect(unavailable).toMatchObject({
      code: 'auth.unavailable',
      status: 503,
      retryAfterSeconds: 30,
    });
  });

  it('keeps a code the SDK does not know', async () => {
    const error = await failure(
      respond(400, { code: 'future.code', message: { code: 'future.code' } }),
    );
    expect(error).toMatchObject({ code: 'future.code', status: 400 });
  });

  it('tells transport failures from API errors (FR-013)', async () => {
    expect(await failure(respond(502, '<html>Bad gateway</html>'))).toMatchObject({
      name: 'UrlkitTransportError',
      kind: 'invalid-response',
      status: 502,
    });
    expect(await failure(respond(500, { unexpected: true }))).toMatchObject({
      kind: 'invalid-response',
    });
    expect(
      await failure(async () => {
        throw new TypeError('fetch failed');
      }),
    ).toMatchObject({ name: 'UrlkitTransportError', kind: 'network' });
    expect(
      await failure(async () => {
        throw new DOMException('timed out', 'TimeoutError');
      }),
    ).toMatchObject({ kind: 'timeout' });
    expect(
      await failure(async () => {
        throw new DOMException('aborted', 'AbortError');
      }),
    ).toMatchObject({ kind: 'aborted' });
  });

  it('reads RateLimit-* on success, and gives null when one is missing (FR-012)', async () => {
    const ok = await client(respond(200, { output: 'x' }, LIMITS)).cleanUrl(BODY);
    expect(ok.rateLimit).toEqual({ limit: 10, remaining: 0, resetSeconds: 30 });
    const partial = await client(
      respond(200, { output: 'x' }, { 'RateLimit-Limit': '10' }),
    ).cleanUrl(BODY);
    expect(partial.rateLimit).toBeNull();
  });

  it('never shows the key or the request body in an error (FR-014, SC-005)', async () => {
    const errors = [
      await failure(respond(401, { code: 'auth.invalid', message: { code: 'auth.invalid' } })),
      await failure(respond(502, 'oops')),
      await failure(async () => {
        throw new TypeError(`fetch failed for Bearer ${KEY}`);
      }),
    ];
    for (const error of errors)
      for (const text of [
        error.message,
        String(error),
        JSON.stringify(error),
        inspect(error, { depth: 5 }),
        error.stack ?? '',
      ])
        for (const secret of [KEY, 'S'.repeat(43), 'secret-path'])
          expect(text, `${error.name}: ${text.slice(0, 60)}`).not.toContain(secret);
    expect(errors[2]).toBeInstanceOf(UrlkitTransportError);
  });
});
