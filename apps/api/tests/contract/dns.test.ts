/** POST /v1/dns against the designed contract (002/T065). */
import { describe, expect, it } from 'vitest';
import { RECORD_TYPES, type DnsAnswer, type DnsObservation, type QueryDns } from '@urlkit/core';
import { post, testApp } from '../helpers.ts';
import { expectContract } from './harness.ts';

const answer = (records: DnsAnswer['records'] = []): DnsAnswer => ({
  rcode: 'NOERROR',
  ad: true,
  ede: [],
  records,
  retriedWithCd: null,
  transportError: false,
});

function observation(name: string): DnsObservation {
  const answers = Object.fromEntries(
    RECORD_TYPES.map((t) => [t, answer()]),
  ) as DnsObservation['answers'];
  answers.A = answer([{ name, type: 'A', ttl: 60, data: '93.184.215.14' }]);
  answers.MX = answer([
    { name, type: 'MX', ttl: 60, data: { preference: 5, exchange: `mx.${name}` } },
  ]);
  return {
    observedAt: '2026-11-11T12:00:00.000Z',
    name,
    resolver: 'quad9',
    answers,
    dmarc: answer(),
  };
}

const querier =
  (fn: QueryDns): (() => QueryDns) =>
  () =>
    fn;
const working = querier(async (name) => observation(name));

describe('POST /v1/dns contract', () => {
  it('200 returns a DnsLookup', async () => {
    const { app } = testApp({ dnsQuerier: working });
    const res = await post(app, '/v1/dns', { target: 'https://www.example.com/x' });
    expect(res.status).toBe(200);
    expect(res.headers.get('RateLimit-Limit')).toBe('10');
    expect(await expectContract(res, 'post', '/dns')).toMatchObject({
      name: { ascii: 'www.example.com' },
      alternative: { ascii: 'example.com', kind: 'registrable' },
      outcome: 'exists',
      dnssec: 'validated',
      resolver: 'quad9',
      records: { A: { state: 'ok' }, MX: { records: [{ data: { priority: 5 } }] } },
    });
  });

  it('scope defaults to host and accepts registrable', async () => {
    const seen: string[] = [];
    const { app } = testApp({
      dnsQuerier: querier(async (name) => (seen.push(name), observation(name))),
    });
    await post(app, '/v1/dns', { target: 'www.example.com' });
    await post(app, '/v1/dns', { target: 'www.example.com', scope: 'registrable' });
    expect(seen).toEqual(['www.example.com', 'example.com']);
    const bad = await post(app, '/v1/dns', { target: 'www.example.com', scope: 'parent' });
    expect(bad.status).toBe(400);
  });

  it('400 for IP literals and special-use names', async () => {
    const { app } = testApp({ dnsQuerier: working });
    for (const [target, code] of [
      ['93.184.215.14', 'dns.ip-literal'],
      ['printer.local', 'dns.special-use'],
    ]) {
      const res = await post(app, '/v1/dns', { target });
      expect(res.status).toBe(400);
      expect(await expectContract(res, 'post', '/dns')).toMatchObject({ code });
    }
  });

  it('503 dns.unavailable does not consume quota', async () => {
    const { app } = testApp({ dnsQuerier: querier(async () => ({ kind: 'unavailable' })) });
    const first = await post(app, '/v1/dns', { target: 'example.com' });
    expect(first.status).toBe(503);
    expect(await expectContract(first, 'post', '/dns')).toMatchObject({ code: 'dns.unavailable' });
    for (let i = 0; i < 12; i++) await post(app, '/v1/dns', { target: 'example.com' });
    const later = await post(app, '/v1/dns', { target: 'example.com' });
    expect(later.status).toBe(503); // never 429: unavailable answers were refunded
  });

  it('429 after 10 requests in an hour', async () => {
    const { app } = testApp({ dnsQuerier: working });
    for (let i = 0; i < 10; i++) await post(app, '/v1/dns', { target: 'example.com' });
    const res = await post(app, '/v1/dns', { target: 'example.com' });
    expect(res.status).toBe(429);
    expect(await expectContract(res, 'post', '/dns')).toMatchObject({ code: 'quota.exceeded' });
  });

  it('?lang=en adds text to the warnings', async () => {
    const { app } = testApp({ dnsQuerier: working });
    const res = await post(app, '/v1/dns?lang=en', { target: 'example.com' });
    const body = (await expectContract(res, 'post', '/dns')) as {
      warnings: Array<{ text?: string }>;
    };
    expect(body.warnings.length).toBeGreaterThan(0);
    for (const w of body.warnings) expect(w.text).toBeTruthy();
  });
});
