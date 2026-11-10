import { describe, expect, it } from 'vitest';
import type { FetchHop, HopResponse } from '@urlkit/core';
import { post, testApp } from '../helpers.ts';
import { expectContract } from './harness.ts';

const fake =
  (map: Record<string, HopResponse>): (() => FetchHop) =>
  () =>
  async (url) =>
    map[url] ?? { kind: 'response', status: 200, location: null, html: null, durationMs: 7 };

describe('POST /v1/inspect contract', () => {
  it('200 returns a RedirectChain', async () => {
    const { app } = testApp({
      inspectFetcher: fake({
        'https://bit.example/x': {
          kind: 'response',
          status: 301,
          location: 'https://ejemplo.com/',
          html: null,
          durationMs: 12,
        },
      }),
    });
    const res = await post(app, '/v1/inspect', { url: 'https://bit.example/x' });
    expect(res.status).toBe(200);
    expect(await expectContract(res, 'post', '/inspect')).toMatchObject({
      stopReason: 'final',
      final: 'https://ejemplo.com/',
      hops: [{ status: 301 }, { status: 200 }],
    });
  });

  it('never returns more than 21 hops', async () => {
    const map: Record<string, HopResponse> = {};
    for (let i = 0; i < 30; i++)
      map[`https://a.example/${i}`] = {
        kind: 'response',
        status: 302,
        location: `/${i + 1}`,
        html: null,
        durationMs: 1,
      };
    const { app } = testApp({ inspectFetcher: fake(map) });
    const body = (await expectContract(
      await post(app, '/v1/inspect', { url: 'https://a.example/0' }),
      'post',
      '/inspect',
    )) as { hops: unknown[]; stopReason: string };
    expect(body.hops).toHaveLength(21);
    expect(body.stopReason).toBe('max-hops');
  });

  it('reports blocked, loop and timeout through stopReason with HTTP 200', async () => {
    const cases: Array<[Record<string, HopResponse>, string, string]> = [
      [
        {
          'https://a.example/': {
            kind: 'blocked',
            code: 'inspect.blocked.private-address',
            durationMs: 0,
          },
        },
        'https://a.example/',
        'blocked',
      ],
      [
        {
          'https://a.example/1': {
            kind: 'response',
            status: 302,
            location: '/2',
            html: null,
            durationMs: 1,
          },
          'https://a.example/2': {
            kind: 'response',
            status: 302,
            location: '/1',
            html: null,
            durationMs: 1,
          },
        },
        'https://a.example/1',
        'loop',
      ],
      [
        { 'https://a.example/': { kind: 'error', code: 'inspect.timeout', durationMs: 5000 } },
        'https://a.example/',
        'timeout',
      ],
    ];
    for (const [map, url, stopReason] of cases) {
      const { app } = testApp({ inspectFetcher: fake(map) });
      const res = await post(app, '/v1/inspect', { url });
      expect(res.status).toBe(200);
      expect(await expectContract(res, 'post', '/inspect')).toMatchObject({ stopReason });
    }
  });

  it('429 after 10 requests in an hour, with Retry-After', async () => {
    const { app } = testApp();
    for (let i = 0; i < 10; i++) await post(app, '/v1/inspect', { url: 'https://a.example/' });
    const res = await post(app, '/v1/inspect', { url: 'https://a.example/' });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await expectContract(res, 'post', '/inspect')).toMatchObject({ code: 'quota.exceeded' });
  });

  it('400 for a non-http(s) URL', async () => {
    const { app } = testApp();
    const res = await post(app, '/v1/inspect', { url: 'ftp://a.example/' });
    expect(res.status).toBe(400);
    expect(await expectContract(res, 'post', '/inspect')).toMatchObject({
      code: 'url.unsupported-scheme',
    });
  });
});
