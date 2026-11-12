/**
 * DoH client of the DNS tool (002/T069, research R6). Wire-format queries (RFC 8484, POST) to
 * two fixed validating resolvers chosen by the product, never by the person. Each query asks for
 * recursion and carries EDNS(0) with the DO bit. A SERVFAIL is retried once with CD, to tell a
 * broken signature from a broken zone. The client only observes: the core decides what it means.
 *
 * The destination is a fixed resolver, not a URL chosen by the person, so this is not an SSRF
 * surface; the connection still goes to a pinned public address with an explicit dispatcher,
 * so proxy environment variables are never honoured.
 */
import type { LookupAddress } from 'node:dns';
import dnsPacket, { type Packet } from 'dns-packet';
import { Agent, request } from 'undici';
import {
  RECORD_TYPES,
  type DnsAnswer,
  type DnsObservation,
  type DnsResolverId,
  type QueryDns,
  type RecordType,
} from '@urlkit/core';

export interface DohResolver {
  id: DnsResolverId;
  url: string;
  /** Fixed address the connection is pinned to. */
  address: string;
}

export const DEFAULT_RESOLVERS: readonly DohResolver[] = [
  { id: 'cloudflare', url: 'https://cloudflare-dns.com/dns-query', address: '1.1.1.1' },
  { id: 'quad9', url: 'https://dns.quad9.net/dns-query', address: '9.9.9.9' },
];

export const QUERY_TIMEOUT_MS = 3000;
export const TOTAL_TIMEOUT_MS = 5000;

/** `dns-packet` decodes header flags and the rcode, but its type declarations omit them. */
type Decoded = Packet & { rcode?: string; flag_ad?: boolean };

const RD = 1 << 8;
const CD = 1 << 4;
const EDE_OPTION = 15;

class TransportError extends Error {}

function agentFor(resolver: DohResolver): Agent {
  const family = resolver.address.includes(':') ? 6 : 4;
  const pinned = (
    _host: string,
    options: { all?: boolean },
    callback: (...args: unknown[]) => void,
  ) => {
    if (options.all)
      callback(null, [{ address: resolver.address, family } satisfies LookupAddress]);
    else callback(null, resolver.address, family);
  };
  return new Agent({ connect: { lookup: pinned as never } });
}

function encode(name: string, type: RecordType, cd: boolean): Buffer {
  return dnsPacket.encode({
    type: 'query',
    id: 0, // RFC 8484 §4.1: 0 keeps responses cacheable
    flags: RD | (cd ? CD : 0),
    questions: [{ name, type }],
    additionals: [
      { type: 'OPT', name: '.', udpPayloadSize: 1232, flags: dnsPacket.DNSSEC_OK } as never,
    ],
  });
}

function ede(packet: Packet): DnsAnswer['ede'] {
  const out: DnsAnswer['ede'] = [];
  for (const record of packet.additionals ?? []) {
    if (record.type !== 'OPT') continue;
    for (const option of (record as { options?: Array<{ code: number; data?: Buffer }> }).options ??
      []) {
      if (option.code !== EDE_OPTION || !option.data || option.data.length < 2) continue;
      const text = option.data.subarray(2).toString('utf8');
      out.push({ code: option.data.readUInt16BE(0), ...(text ? { text } : {}) });
    }
  }
  return out;
}

/** Decoded record data as plain values: Buffers become strings. */
function plain(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (Array.isArray(value)) return value.map(plain);
  return value;
}

function records(packet: Packet): DnsAnswer['records'] {
  return (packet.answers ?? [])
    .filter((a) => (RECORD_TYPES as readonly string[]).includes(a.type))
    .map((a) => ({
      name: a.name,
      type: a.type as RecordType,
      ttl: (a as { ttl?: number }).ttl ?? 0,
      data: plain((a as { data?: unknown }).data),
    }));
}

export function createQueryDns({
  resolvers = DEFAULT_RESOLVERS,
  queryTimeoutMs = QUERY_TIMEOUT_MS,
  totalTimeoutMs = TOTAL_TIMEOUT_MS,
  now = () => new Date(),
}: {
  resolvers?: readonly DohResolver[];
  queryTimeoutMs?: number;
  totalTimeoutMs?: number;
  now?: () => Date;
} = {}): QueryDns {
  return async (name, { dmarcOf }) => {
    const deadline = AbortSignal.timeout(totalTimeoutMs);
    const observedAt = now().toISOString();

    const send = async (resolver: DohResolver, agent: Agent, query: Buffer): Promise<Decoded> => {
      try {
        const res = await request(resolver.url, {
          method: 'POST',
          dispatcher: agent,
          headers: { 'content-type': 'application/dns-message', accept: 'application/dns-message' },
          body: query,
          signal: AbortSignal.any([deadline, AbortSignal.timeout(queryTimeoutMs)]),
        });
        const body = Buffer.from(await res.body.arrayBuffer());
        if (res.statusCode !== 200) throw new TransportError(`HTTP ${res.statusCode}`);
        return dnsPacket.decode(body) as Decoded;
      } catch (error) {
        throw error instanceof TransportError ? error : new TransportError(String(error));
      }
    };

    const ask = async (
      resolver: DohResolver,
      agent: Agent,
      qname: string,
      type: RecordType,
    ): Promise<DnsAnswer> => {
      const packet = await send(resolver, agent, encode(qname, type, false));
      const answer: DnsAnswer = {
        rcode: packet.rcode ?? null,
        ad: packet.flag_ad === true,
        ede: ede(packet),
        records: records(packet),
        retriedWithCd: null,
        transportError: false,
      };
      if (answer.rcode !== 'SERVFAIL') return answer;
      try {
        const retry = await send(resolver, agent, encode(qname, type, true));
        // The records of the unvalidated answer are kept, so a bogus zone can still be shown.
        return {
          ...answer,
          records: records(retry),
          retriedWithCd: { rcode: retry.rcode ?? null },
        };
      } catch {
        return answer;
      }
    };

    const failed: DnsAnswer = {
      rcode: null,
      ad: false,
      ede: [],
      records: [],
      retriedWithCd: null,
      transportError: true,
    };

    for (const resolver of resolvers) {
      const agent = agentFor(resolver);
      try {
        // The first answer decides the resolver; only a transport error moves to the next one.
        const first = await ask(resolver, agent, name, 'A');
        const rest = await Promise.all([
          ...RECORD_TYPES.slice(1).map((type) =>
            ask(resolver, agent, name, type).catch(() => failed),
          ),
          dmarcOf ? ask(resolver, agent, `_dmarc.${dmarcOf}`, 'TXT').catch(() => failed) : null,
        ]);
        const answers = Object.fromEntries(
          RECORD_TYPES.map((type, i) => [type, i === 0 ? first : rest[i - 1]]),
        ) as DnsObservation['answers'];
        return {
          observedAt,
          name,
          resolver: resolver.id,
          answers,
          dmarc: rest.at(-1) ?? null,
        };
      } catch {
        if (deadline.aborted) break;
      } finally {
        void agent.close().catch(() => undefined);
      }
    }
    return { kind: 'unavailable' };
  };
}
