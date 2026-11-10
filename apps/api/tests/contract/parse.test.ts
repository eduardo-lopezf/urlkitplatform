import { describe, expect, it } from 'vitest';
import { post, testApp } from '../helpers.ts';
import { expectContract } from './harness.ts';

describe('POST /v1/parse contract', () => {
  it('200 returns a ParsedUrl', async () => {
    const { app } = testApp();
    const res = await post(app, '/v1/parse', {
      url: 'https://usuario@münchen.de:8080/a%20b/c?x=1&x=2&y=#sec',
    });
    expect(res.status).toBe(200);
    expect(await expectContract(res, 'post', '/parse')).toMatchObject({
      host: { ascii: 'xn--mnchen-3ya.de', unicode: 'münchen.de' },
      port: { value: 8080, isDefault: false },
      fragment: 'sec',
    });
  });

  it('400 names the invalid part', async () => {
    const { app } = testApp();
    const res = await post(app, '/v1/parse', { url: 'https://ejemplo.com:99999/' });
    expect(res.status).toBe(400);
    expect(await expectContract(res, 'post', '/parse')).toMatchObject({
      code: 'url.invalid',
      part: 'port',
    });
  });
});
