import { describe, expect, it } from 'vitest';
import { post, testApp } from '../helpers.ts';
import { expectContract } from './harness.ts';

describe('POST /v1/clean contract', () => {
  it('200 returns a CleanResult with catalogVersion and RateLimit headers', async () => {
    const { app } = testApp();
    const res = await post(app, '/v1/clean', { url: 'https://ejemplo.com/?utm_source=x&id=1' });
    expect(res.status).toBe(200);
    expect(res.headers.get('RateLimit-Limit')).toBe('600');
    const body = await expectContract(res, 'post', '/clean');
    expect(body).toMatchObject({
      output: 'https://ejemplo.com/?id=1',
      mode: 'safe',
      catalogVersion: expect.stringMatching(/^\d+\.\d+\.\d+$/),
    });
  });

  it('applies mode and keep from the request', async () => {
    const { app } = testApp();
    const res = await post(app, '/v1/clean', {
      url: 'https://ejemplo.com/?ref=a&utm_source=x',
      mode: 'max',
      keep: ['utm_source'],
    });
    expect(await expectContract(res, 'post', '/clean')).toMatchObject({
      output: 'https://ejemplo.com/?utm_source=x',
      maxPreview: null,
    });
  });

  it('400 returns a ToolError for invalid URLs and invalid bodies', async () => {
    const { app } = testApp();
    const invalid = await post(app, '/v1/clean', { url: 'https://exa<mple.com/' });
    expect(invalid.status).toBe(400);
    expect(await expectContract(invalid, 'post', '/clean')).toMatchObject({
      code: 'url.invalid',
      part: 'host',
    });

    const scheme = await post(app, '/v1/clean', { url: 'mailto:a@ejemplo.com' });
    expect(await expectContract(scheme, 'post', '/clean')).toMatchObject({
      code: 'url.unsupported-scheme',
    });

    for (const body of [
      {},
      { url: '' },
      { url: 42 },
      { url: 'https://a.example', mode: 'loud' },
      '{bad json',
    ]) {
      const res = await post(app, '/v1/clean', body);
      expect(res.status).toBe(400);
      expect(await expectContract(res, 'post', '/clean')).toMatchObject({
        code: 'request.invalid',
      });
    }

    const tooLong = await post(app, '/v1/clean', {
      url: 'https://ejemplo.com/?q=' + 'a'.repeat(32_000),
    });
    expect(tooLong.status).toBe(400);
  });

  it('429 after the local quota (600/hour) with Retry-After', async () => {
    const { app } = testApp();
    let last: Response | undefined;
    for (let i = 0; i <= 600; i++)
      last = await post(app, '/v1/clean', { url: 'https://ejemplo.com/' });
    expect(last?.status).toBe(429);
    expect(last?.headers.get('Retry-After')).toBeTruthy();
    expect(await expectContract(last!, 'post', '/clean')).toMatchObject({ code: 'quota.exceeded' });
  });
});
