/**
 * Recorded DoH answers for the DNS tests (002/T005), built with `dns-packet` from readable data
 * so no fixture is opaque binary. `answer(query)` returns the wire response a fake resolver sends
 * back for a decoded query; the fake DoH server of the DNS tests serves it as
 * `application/dns-message`.
 *
 * Zones:
 * - `signed.test`: every type present, AD set (DNSSEC validated).
 * - `unsigned.test`: same records, AD clear.
 * - `bogus.test`: SERVFAIL with EDE 6 (DNSSEC Bogus).
 * - `bogus-no-ede.test`: SERVFAIL without EDE; answers NOERROR when CD is set.
 * - `missing.test`: NXDOMAIN with AD set.
 * - `empty.test`: NOERROR with no answers for any type.
 */
import dnsPacket, { type Answer, type Packet } from 'dns-packet';

type RecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'CAA' | 'SOA';

const TTL = 300;

const RECORDS = (zone: string): Partial<Record<RecordType, Answer[]>> => ({
  A: [{ name: zone, type: 'A', ttl: TTL, data: '93.184.215.14' }],
  AAAA: [{ name: zone, type: 'AAAA', ttl: TTL, data: '2606:2800:21f:cb07:6820:80da:af6b:8b2c' }],
  MX: [{ name: zone, type: 'MX', ttl: 3600, data: { preference: 10, exchange: `mail.${zone}` } }],
  NS: [
    { name: zone, type: 'NS', ttl: 86400, data: `ns1.${zone}` },
    { name: zone, type: 'NS', ttl: 86400, data: `ns2.${zone}` },
  ],
  // Multi-string TXT: the tool must join the fragments.
  TXT: [
    { name: zone, type: 'TXT', ttl: TTL, data: ['v=spf1 include:_spf.', `${zone} -all`] },
    { name: zone, type: 'TXT', ttl: TTL, data: ['google-site-verification=abc123'] },
  ],
  CAA: [
    {
      name: zone,
      type: 'CAA',
      ttl: TTL,
      data: { flags: 0, tag: 'issue', value: 'letsencrypt.org' },
    },
  ],
  SOA: [
    {
      name: zone,
      type: 'SOA',
      ttl: 3600,
      data: {
        mname: `ns1.${zone}`,
        rname: `hostmaster.${zone}`,
        serial: 2026111101,
        refresh: 7200,
        retry: 3600,
        expire: 1209600,
        minimum: 300,
      },
    },
  ],
});

/** EDNS(0) OPT record with the DO bit, optionally carrying one Extended DNS Error (RFC 8914). */
function opt(ede?: { code: number; text: string }): Answer {
  const options = ede
    ? [
        {
          code: 15,
          data: Buffer.concat([
            Buffer.from([ede.code >> 8, ede.code & 0xff]),
            Buffer.from(ede.text, 'utf8'),
          ]),
        },
      ]
    : [];
  return {
    type: 'OPT',
    name: '.',
    udpPayloadSize: 1232,
    flags: dnsPacket.DNSSEC_OK,
    options,
  } as Answer;
}

const AD = 1 << 5;
const CD = 1 << 4;
const RD = 1 << 8;
const RA = 1 << 7;
const RCODE = { NOERROR: 0, SERVFAIL: 2, NXDOMAIN: 3 } as const;

function response(
  query: Packet,
  rcode: keyof typeof RCODE,
  answers: Answer[],
  ad: boolean,
  ede?: { code: number; text: string },
): Buffer {
  return dnsPacket.encode({
    id: query.id ?? 0,
    type: 'response',
    flags: RD | RA | (ad ? AD : 0) | ((query.flags ?? 0) & CD) | RCODE[rcode],
    questions: query.questions ?? [],
    answers,
    additionals: [opt(ede)],
  });
}

const zoneOf = (name: string) =>
  [
    'bogus-no-ede.test',
    'signed.test',
    'unsigned.test',
    'bogus.test',
    'missing.test',
    'empty.test',
  ].find((zone) => name === zone || name.endsWith(`.${zone}`));

/** The recorded answer to one decoded query. Unknown zones answer SERVFAIL without EDE. */
export function answer(query: Packet): Buffer {
  const question = query.questions?.[0];
  const name = (question?.name ?? '').toLowerCase().replace(/\.$/, '');
  const type = question?.type as RecordType;
  const zone = zoneOf(name);
  const cd = ((query.flags ?? 0) & CD) !== 0;
  const records = zone && name === zone ? (RECORDS(zone)[type] ?? []) : [];

  switch (zone) {
    case 'signed.test':
      return response(query, 'NOERROR', records, true);
    case 'unsigned.test':
      return response(query, 'NOERROR', records, false);
    case 'bogus.test':
      return cd
        ? response(query, 'NOERROR', records, false)
        : response(query, 'SERVFAIL', [], false, { code: 6, text: 'DNSSEC Bogus' });
    case 'bogus-no-ede.test':
      return cd
        ? response(query, 'NOERROR', records, false)
        : response(query, 'SERVFAIL', [], false);
    case 'missing.test':
      return response(query, 'NXDOMAIN', [], true);
    case 'empty.test':
      return response(query, 'NOERROR', [], false);
    default:
      return response(query, 'SERVFAIL', [], false);
  }
}

export const ZONES = [
  'signed.test',
  'unsigned.test',
  'bogus.test',
  'bogus-no-ede.test',
  'missing.test',
  'empty.test',
] as const;
