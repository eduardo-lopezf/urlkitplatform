/**
 * No regression for anonymous use (003/T013, FR-011, SC-002). The snapshot was written before any
 * API key code existed: a request without `Authorization` must keep the same status, the same
 * response shape and the same `RateLimit-*` values through every phase of the feature.
 */
import { describe, expect, it } from 'vitest';
import { post, testApp } from '../helpers.ts';

const URL_IN = 'https://ejemplo.com/?utm_source=x&id=1';
const REQUESTS: Array<[string, unknown]> = [
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

describe('anonymous use does not change (003, SC-002)', () => {
  it('keeps status, response shape and rate-limit headers on every tool endpoint', async () => {
    const { app } = testApp();
    const seen: Record<string, unknown> = {};
    for (const [path, body] of REQUESTS) {
      const res = await post(app, path, body);
      const json = (await res.json()) as Record<string, unknown>;
      seen[path] = {
        status: res.status,
        keys: Object.keys(json).sort(),
        limit: res.headers.get('RateLimit-Limit'),
        remaining: res.headers.get('RateLimit-Remaining'),
        authenticate: res.headers.get('WWW-Authenticate'),
      };
    }
    expect(seen).toMatchSnapshot();
  });
});
