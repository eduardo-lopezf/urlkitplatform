/** DNS: records, DNSSEC state and outcome from a synthetic observation (002/T063). */
import { describe, expect, it } from 'vitest';
import {
  analyzeDns,
  analyzeHost,
  dnsTool,
  RECORD_TYPES,
  type DnsAnswer,
  type DnsLookup,
  type DnsObservation,
  type RecordType,
} from '../../src/index.ts';

const ok = (records: DnsAnswer['records'] = [], extra: Partial<DnsAnswer> = {}): DnsAnswer => ({
  rcode: 'NOERROR',
  ad: true,
  ede: [],
  records,
  retriedWithCd: null,
  transportError: false,
  ...extra,
});

const rec = (type: RecordType, data: unknown, name = 'example.com', ttl = 300) => ({
  name,
  type,
  ttl,
  data,
});

function full(): Record<RecordType, DnsAnswer> {
  return {
    A: ok([rec('A', '93.184.215.14')]),
    AAAA: ok([rec('AAAA', '2606:2800::1')]),
    CNAME: ok(),
    MX: ok([rec('MX', { preference: 10, exchange: 'mail.example.com' }, 'example.com', 3600)]),
    NS: ok([rec('NS', 'ns1.example.com'), rec('NS', 'ns2.example.com')]),
    TXT: ok([rec('TXT', ['v=spf1 include:_spf.', 'example.com -all']), rec('TXT', ['hello'])]),
    CAA: ok([rec('CAA', { flags: 0, tag: 'issue', value: 'letsencrypt.org' })]),
    SOA: ok([
      rec('SOA', {
        mname: 'ns1.example.com',
        rname: 'hostmaster.example.com',
        serial: 1,
        refresh: 2,
        retry: 3,
        expire: 4,
        minimum: 5,
      }),
    ]),
  };
}

function observe(
  answers: Partial<Record<RecordType, DnsAnswer>> = {},
  extra: Partial<DnsObservation> = {},
): DnsObservation {
  return {
    observedAt: '2026-11-11T12:00:00.000Z',
    name: 'example.com',
    resolver: 'cloudflare',
    answers: { ...full(), ...answers },
    dmarc: ok([rec('TXT', ['v=DMARC1; p=reject'], '_dmarc.example.com')]),
    ...extra,
  };
}

const host = (input: string) => {
  const r = analyzeHost(input);
  if (!r.ok) throw new Error(input);
  return r.value;
};
const run = (o: DnsObservation, input = 'example.com', scope: 'host' | 'registrable' = 'host') =>
  analyzeDns({ input, host: host(input), scope }, o);
const codes = (r: DnsLookup) => r.warnings.map((w) => w.code);
const every = (answer: DnsAnswer) =>
  Object.fromEntries(RECORD_TYPES.map((t) => [t, answer])) as Record<RecordType, DnsAnswer>;

describe('records', () => {
  it('groups records by type, with TTL and structured data', () => {
    const r = run(observe());
    expect(r.outcome).toBe('exists');
    expect(r.resolver).toBe('cloudflare');
    expect(r.records.A).toEqual({
      state: 'ok',
      records: [{ name: 'example.com', ttl: 300, data: '93.184.215.14' }],
    });
    expect(r.records.MX.records[0]).toEqual({
      name: 'example.com',
      ttl: 3600,
      data: { priority: 10, exchange: 'mail.example.com' },
    });
    expect(r.records.CAA.records[0]?.data).toEqual({
      flags: 0,
      tag: 'issue',
      value: 'letsencrypt.org',
    });
    expect(r.records.SOA.records[0]?.data).toMatchObject({ mname: 'ns1.example.com', serial: 1 });
    expect(r.records.CNAME).toEqual({ state: 'empty', records: [] });
  });

  it('joins TXT fragments', () => {
    expect(run(observe()).records.TXT.records.map((x) => x.data)).toEqual([
      'v=spf1 include:_spf.example.com -all',
      'hello',
    ]);
  });

  it('keeps only records of the queried type in each section', () => {
    const r = run(
      observe({
        A: ok([rec('CNAME', 'edge.example.net'), rec('A', '1.2.3.4', 'edge.example.net')]),
      }),
    );
    expect(r.records.A.records).toEqual([{ name: 'edge.example.net', ttl: 300, data: '1.2.3.4' }]);
  });

  it('a transport error on one type fails that type only', () => {
    const r = run(observe({ MX: ok([], { rcode: null, transportError: true }) }));
    expect(r.records.MX.state).toBe('failed');
    expect(r.records.A.state).toBe('ok');
    expect(r.outcome).toBe('exists');
  });
});

describe('DNSSEC', () => {
  it('validated when every answer carries AD', () => {
    const r = run(observe());
    expect(r.dnssec).toBe('validated');
    expect(codes(r)).not.toContain('dns.unsigned');
  });

  it('unsigned when AD is clear', () => {
    const r = run(observe(every(ok([], { ad: false }))));
    expect(r.dnssec).toBe('unsigned');
    expect(codes(r)).toContain('dns.unsigned');
  });

  it('bogus on SERVFAIL with a DNSSEC EDE', () => {
    const r = run(
      observe(
        every(ok([], { rcode: 'SERVFAIL', ad: false, ede: [{ code: 6, text: 'DNSSEC Bogus' }] })),
      ),
    );
    expect(r.dnssec).toBe('bogus');
    expect(codes(r)).toContain('dns.bogus');
  });

  it('bogus on SERVFAIL without EDE that resolves with CD', () => {
    const r = run(
      observe(
        every(
          ok([rec('A', '1.2.3.4')], {
            rcode: 'SERVFAIL',
            ad: false,
            retriedWithCd: { rcode: 'NOERROR' },
          }),
        ),
      ),
    );
    expect(r.dnssec).toBe('bogus');
    expect(r.outcome).toBe('exists');
  });

  it('failed and unknown on SERVFAIL otherwise', () => {
    const r = run(
      observe(
        every(ok([], { rcode: 'SERVFAIL', ad: false, retriedWithCd: { rcode: 'SERVFAIL' } })),
      ),
    );
    expect(r.outcome).toBe('failed');
    expect(r.dnssec).toBe('unknown');
    expect(codes(r)).toContain('dns.failed');
    expect(Object.values(r.records).every((s) => s.state === 'failed')).toBe(true);
  });
});

describe('outcome', () => {
  it('NXDOMAIN means the domain does not exist', () => {
    const r = run(observe(every(ok([], { rcode: 'NXDOMAIN' }))));
    expect(r.outcome).toBe('nxdomain');
    expect(r.dnssec).toBe('validated');
    expect(codes(r)).toEqual(['dns.nxdomain']);
  });

  it('NOERROR without records is an empty type, not a failure', () => {
    expect(run(observe({ AAAA: ok([]) })).records.AAAA.state).toBe('empty');
  });
});

describe('configuration warnings', () => {
  it('no CAA, no SPF, no DMARC on the registrable domain', () => {
    const r = run(observe({ CAA: ok([]), TXT: ok([rec('TXT', ['hello'])]) }, { dmarc: ok([]) }));
    expect(codes(r)).toEqual(['dns.no-caa', 'dns.no-spf', 'dns.no-dmarc']);
  });

  it('are not raised for a subdomain, where CAA and mail records belong to the parent', () => {
    const r = run(
      observe({ CAA: ok([]), TXT: ok([]) }, { name: 'www.example.com', dmarc: ok([]) }),
      'www.example.com',
    );
    expect(codes(r)).toEqual([]);
  });
});

describe('names', () => {
  it('offers the registrable domain as alternative for a host', () => {
    const r = run(observe({}, { name: 'www.example.com' }), 'https://www.example.com/x');
    expect(r.name).toEqual({ unicode: 'www.example.com', ascii: 'www.example.com' });
    expect(r.alternative).toEqual({
      unicode: 'example.com',
      ascii: 'example.com',
      kind: 'registrable',
    });
  });

  it('offers the host back when the registrable domain was queried', () => {
    const r = run(observe(), 'www.example.com', 'registrable');
    expect(r.name.ascii).toBe('example.com');
    expect(r.alternative).toEqual({
      unicode: 'www.example.com',
      ascii: 'www.example.com',
      kind: 'host',
    });
  });

  it('has no alternative when host and registrable domain are the same', () => {
    expect(run(observe()).alternative).toBeNull();
  });

  it('gives IDN names in Unicode and ASCII', () => {
    const r = run(observe({}, { name: 'xn--mnchen-3ya.de' }), 'münchen.de');
    expect(r.name).toEqual({ unicode: 'münchen.de', ascii: 'xn--mnchen-3ya.de' });
  });
});

describe('determinism', () => {
  it('gives the same result twice', () => {
    expect(run(observe())).toEqual(run(observe()));
  });
});

describe('dnsTool', () => {
  it('queries the chosen name, with the DMARC domain', async () => {
    const calls: unknown[] = [];
    const queryDns = async (name: string, opts: { dmarcOf: string | null }) => {
      calls.push([name, opts]);
      return observe({}, { name });
    };
    await dnsTool.run({ target: 'https://www.example.com/a', scope: 'host' }, { queryDns });
    await dnsTool.run({ target: 'www.example.com', scope: 'registrable' }, { queryDns });
    expect(calls).toEqual([
      ['www.example.com', { dmarcOf: 'example.com' }],
      ['example.com', { dmarcOf: 'example.com' }],
    ]);
  });

  it('rejects IP literals and special-use names before any query', async () => {
    let calls = 0;
    const queryDns = async () => (calls++, observe());
    expect(
      await dnsTool.run({ target: '93.184.215.14', scope: 'host' }, { queryDns }),
    ).toMatchObject({ ok: false, error: { code: 'dns.ip-literal' } });
    expect(await dnsTool.run({ target: 'localhost', scope: 'host' }, { queryDns })).toMatchObject({
      ok: false,
      error: { code: 'dns.special-use' },
    });
    expect(calls).toBe(0);
  });

  it('reports unavailable resolvers as dns.unavailable', async () => {
    const r = await dnsTool.run(
      { target: 'example.com', scope: 'host' },
      { queryDns: async () => ({ kind: 'unavailable' }) },
    );
    expect(r).toMatchObject({ ok: false, error: { code: 'dns.unavailable' } });
  });

  it('declares its registry entry and share format', () => {
    expect(dnsTool).toMatchObject({
      id: 'dns',
      runsOn: 'server',
      sendTo: ['tls', 'headers', 'security'],
    });
    const input = { target: 'www.example.com', scope: 'registrable' as const };
    expect(dnsTool.share.decode(dnsTool.share.encode(input))).toEqual(input);
    expect(dnsTool.share.decode('u=example.com')).toEqual({ target: 'example.com', scope: 'host' });
  });
});
