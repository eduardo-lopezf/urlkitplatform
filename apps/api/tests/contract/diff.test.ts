import { describe, expect, it } from 'vitest';
import { post, testApp } from '../helpers.ts';
import { expectContract } from './harness.ts';

describe('POST /v1/diff contract', () => {
  it('200 returns a UrlComparison with defaults applied', async () => {
    const { app } = testApp();
    const res = await post(app, '/v1/diff', {
      a: 'https://a.example/?x=1&y=2&utm_campaign=a',
      b: 'https://a.example/?y=2&x=1&utm_campaign=b',
    });
    expect(res.status).toBe(200);
    expect(await expectContract(res, 'post', '/diff')).toMatchObject({
      options: { ignoreParamOrder: true, ignoreTracking: false, normalize: true },
      differences: [{ component: 'query', param: 'utm_campaign', change: 'modified' }],
    });
  });

  it('reports catalogVersion only when ignoreTracking uses the catalog', async () => {
    const { app } = testApp();
    const res = await post(app, '/v1/diff', {
      a: 'https://a.example/?utm_source=x',
      b: 'https://a.example/',
      options: { ignoreTracking: true },
    });
    expect(await expectContract(res, 'post', '/diff')).toMatchObject({
      equivalent: true,
      catalogVersion: expect.any(String),
    });
  });

  it('400 names the invalid side', async () => {
    const { app } = testApp();
    const res = await post(app, '/v1/diff', { a: 'https://a.example/', b: 'https://exa<mple/' });
    expect(res.status).toBe(400);
    expect(await expectContract(res, 'post', '/diff')).toMatchObject({
      code: 'url.invalid',
      part: 'b.host',
    });
  });
});
