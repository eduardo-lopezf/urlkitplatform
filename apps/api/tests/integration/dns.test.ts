/**
 * DoH client against a local fake resolver that serves the recorded answers of
 * tests/fixtures/dns (002/T064). No real network.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import dnsPacket, { type Packet } from 'dns-packet';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DnsObservation } from '@urlkit/core';
import { isBlockedAddress } from '../../src/inspect/ssrf.ts';
import { createQueryDns, DEFAULT_RESOLVERS, type DohResolver } from '../../src/probes/dns/doh.ts';
import { answer } from '../fixtures/dns/build.ts';

interface Seen {
  method: string;
  contentType: string | undefined;
  accept: string | undefined;
  query: Packet & { flag_rd?: boolean; flag_cd?: boolean };
}

let primary: Server;
let fallback: Server;
let silent: Server;
const seenPrimary: Seen[] = [];
const seenFallback: Seen[] = [];
let ports = { primary: 0, fallback: 0, silent: 0, closed: 0 };

const body = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

function fakeResolver(seen: Seen[]) {
  return createServer(async (req, res) => {
    const query = dnsPacket.decode(await body(req)) as Seen['query'];
    seen.push({
      method: req.method ?? '',
      contentType: req.headers['content-type'],
      accept: req.headers.accept,
      query,
    });
    res.writeHead(200, { 'content-type': 'application/dns-message' }).end(answer(query));
  });
}

const listen = (server: Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const a = server.address();
      resolve(typeof a === 'object' && a ? a.port : 0);
    }),
  );

beforeAll(async () => {
  primary = fakeResolver(seenPrimary);
  fallback = fakeResolver(seenFallback);
  silent = createServer(() => undefined); // never answers
  ports = {
    primary: await listen(primary),
    fallback: await listen(fallback),
    silent: await listen(silent),
    closed: 0,
  };
  const closed = createServer();
  ports.closed = await listen(closed);
  await new Promise<void>((resolve) => closed.close(() => resolve()));
});

afterAll(async () => {
  silent.closeAllConnections();
  for (const s of [primary, fallback, silent])
    await new Promise<void>((resolve) => s.close(() => resolve()));
});

const resolver = (id: DohResolver['id'], port: number): DohResolver => ({
  id,
  url: `http://doh.test:${port}/dns-query`,
  address: '127.0.0.1',
});

const client = (primaryPort = ports.primary, fallbackPort = ports.fallback, timing = {}) =>
  createQueryDns({
    resolvers: [resolver('cloudflare', primaryPort), resolver('quad9', fallbackPort)],
    now: () => new Date('2026-11-11T12:00:00Z'),
    ...timing,
  });

async function lookup(name: string, q = client()): Promise<DnsObservation> {
  const result = await q(name, { dmarcOf: name });
  if ('kind' in result) throw new Error('unavailable');
  return result;
}

describe('DoH client', () => {
  it('posts wire-format queries with RD and the EDNS DO bit, all 8 types plus DMARC', async () => {
    seenPrimary.length = 0;
    const o = await lookup('signed.test');
    expect(o).toMatchObject({
      name: 'signed.test',
      resolver: 'cloudflare',
      observedAt: '2026-11-11T12:00:00.000Z',
    });
    const types = seenPrimary.map(
      (s) => `${s.query.questions?.[0]?.type} ${s.query.questions?.[0]?.name}`,
    );
    expect(types.sort()).toEqual(
      [
        'A signed.test',
        'AAAA signed.test',
        'CAA signed.test',
        'CNAME signed.test',
        'MX signed.test',
        'NS signed.test',
        'SOA signed.test',
        'TXT signed.test',
        'TXT _dmarc.signed.test',
      ].sort(),
    );
    for (const s of seenPrimary) {
      expect(s).toMatchObject({
        method: 'POST',
        contentType: 'application/dns-message',
        accept: 'application/dns-message',
      });
      expect(s.query.flag_rd).toBe(true);
      const opt = s.query.additionals?.find((a) => a.type === 'OPT') as
        { flags?: number } | undefined;
      expect((opt?.flags ?? 0) & dnsPacket.DNSSEC_OK).toBe(dnsPacket.DNSSEC_OK);
    }
  });

  it('decodes records with TTL, AD and plain data', async () => {
    const o = await lookup('signed.test');
    expect(o.answers.A).toMatchObject({
      rcode: 'NOERROR',
      ad: true,
      records: [{ ttl: 300, data: '93.184.215.14' }],
    });
    expect(o.answers.TXT.records[0]?.data).toEqual(['v=spf1 include:_spf.', 'signed.test -all']);
    expect(o.answers.MX.records[0]?.data).toEqual({ preference: 10, exchange: 'mail.signed.test' });
    expect(o.answers.CAA.records[0]?.data).toMatchObject({
      tag: 'issue',
      value: 'letsencrypt.org',
    });
    expect((await lookup('unsigned.test')).answers.A.ad).toBe(false);
  });

  it('reads EDE and retries with CD only after SERVFAIL', async () => {
    seenPrimary.length = 0;
    const bogus = await lookup('bogus.test');
    expect(bogus.answers.A).toMatchObject({
      rcode: 'SERVFAIL',
      ede: [{ code: 6, text: 'DNSSEC Bogus' }],
      retriedWithCd: { rcode: 'NOERROR' },
    });
    const cd = seenPrimary.filter((s) => s.query.flag_cd);
    expect(cd.length).toBeGreaterThan(0);
    seenPrimary.length = 0;
    await lookup('signed.test');
    expect(seenPrimary.some((s) => s.query.flag_cd)).toBe(false);
  });

  it('distinguishes NXDOMAIN and empty answers', async () => {
    expect((await lookup('missing.test')).answers.A).toMatchObject({ rcode: 'NXDOMAIN', ad: true });
    expect((await lookup('empty.test')).answers.MX).toMatchObject({
      rcode: 'NOERROR',
      records: [],
    });
  });

  it('uses the fallback only on a transport error of the primary', async () => {
    seenFallback.length = 0;
    const o = await lookup('signed.test', client(ports.closed, ports.fallback));
    expect(o.resolver).toBe('quad9');
    expect(seenFallback.length).toBeGreaterThan(0);

    seenFallback.length = 0;
    await lookup('missing.test');
    await lookup('bogus.test');
    expect(seenFallback).toEqual([]); // NXDOMAIN and SERVFAIL are answers, not transport errors
  });

  it('times out per query and reports unavailable when both resolvers fail', async () => {
    const started = Date.now();
    const q = client(ports.silent, ports.closed, { queryTimeoutMs: 200, totalTimeoutMs: 600 });
    expect(await q('signed.test', { dmarcOf: 'signed.test' })).toEqual({ kind: 'unavailable' });
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('fixed resolvers', () => {
  it('are Cloudflare and Quad9, on public addresses, over https', () => {
    expect(DEFAULT_RESOLVERS.map((r) => r.id)).toEqual(['cloudflare', 'quad9']);
    for (const r of DEFAULT_RESOLVERS) {
      expect(isBlockedAddress(r.address), r.address).toBe(false);
      expect(r.url).toMatch(/^https:\/\//);
    }
  });
});
