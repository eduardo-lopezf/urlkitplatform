import { describe, expect, it } from 'vitest';
import { post, testApp } from '../helpers.ts';
import { expectContract } from './harness.ts';

type Body = {
  parts: Array<{ message: { code: string; text?: string } }>;
  signals: Array<{ id: string; message: { code: string; text?: string } }>;
};

describe('POST /v1/explain contract', () => {
  it('200 returns codes only by default', async () => {
    const { app } = testApp();
    const res = await post(app, '/v1/explain', {
      url: 'https://paypal.com@ejemplo-malo.xyz/login',
    });
    expect(res.status).toBe(200);
    const body = (await expectContract(res, 'post', '/explain')) as Body;
    expect(body.signals[0]).toMatchObject({
      id: 'userinfo-deception',
      message: { code: 'explain.signal.userinfo-deception' },
    });
    expect(body.signals[0]?.message.text).toBeUndefined();
  });

  it.each(['es', 'en'] as const)(
    '?lang=%s adds text to every MessageRef and keeps the codes',
    async (lang) => {
      const { app } = testApp();
      const res = await post(app, `/v1/explain?lang=${lang}`, {
        url: 'https://paypal.com@ejemplo-malo.xyz/login',
      });
      const body = (await expectContract(res, 'post', '/explain')) as Body;
      const refs = [...body.parts.map((p) => p.message), ...body.signals.map((s) => s.message)];
      expect(refs.length).toBeGreaterThan(3);
      for (const ref of refs) {
        expect(ref.code).toMatch(/^explain\./);
        expect(ref.text).toEqual(expect.any(String));
      }
      expect(body.signals[0]?.message.text).toContain('ejemplo-malo.xyz');
    },
  );

  it('400 for an unknown lang', async () => {
    const { app } = testApp();
    const res = await post(app, '/v1/explain?lang=fr', { url: 'https://a.example/' });
    expect(res.status).toBe(400);
    await expectContract(res, 'post', '/explain');
  });
});
