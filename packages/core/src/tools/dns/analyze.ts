/**
 * DNS evaluation (002/T068, research R6). Pure: it receives the answers the DoH client observed
 * and decides whether the name exists, the DNSSEC state of the zone and which configuration
 * records are missing. The client only reports flags, codes and records.
 */
import type { MessageRef } from '../../types.ts';
import type { HostInfo } from '../../url/host.ts';
import { hostToUnicode } from '../../url/parse.ts';
import { RECORD_TYPES, type DnsAnswer, type DnsObservation, type RecordType } from './types.ts';

export type DnsScope = 'host' | 'registrable';

export interface DnsName {
  unicode: string;
  ascii: string;
}

/** A string for A, AAAA, CNAME, NS and TXT; an object for MX, CAA and SOA. */
export type DnsRecordData = string | Record<string, string | number>;

export interface DnsRecordSet {
  state: 'ok' | 'empty' | 'failed';
  records: Array<{ name: string; ttl: number; data: DnsRecordData }>;
}

export interface DnsLookup {
  input: string;
  name: DnsName;
  alternative: (DnsName & { kind: DnsScope }) | null;
  outcome: 'exists' | 'nxdomain' | 'failed';
  dnssec: 'validated' | 'unsigned' | 'bogus' | 'unknown';
  resolver: DnsObservation['resolver'];
  records: Record<RecordType, DnsRecordSet>;
  warnings: MessageRef[];
}

/** RFC 8914: Extended DNS Error codes 1–12 are DNSSEC failures. */
const isDnssecEde = (code: number) => code >= 1 && code <= 12;

/** The name a lookup queries for each scope, and the other one it can offer. */
export function dnsNames(
  host: HostInfo,
  scope: DnsScope,
): { name: DnsName; alternative: (DnsName & { kind: DnsScope }) | null } {
  const self: DnsName = { unicode: host.unicode, ascii: host.ascii };
  const registrable = host.registrable
    ? { unicode: hostToUnicode(host.registrable), ascii: host.registrable }
    : null;
  if (!registrable || registrable.ascii === host.ascii) return { name: self, alternative: null };
  return scope === 'registrable'
    ? { name: registrable, alternative: { ...self, kind: 'host' } }
    : { name: self, alternative: { ...registrable, kind: 'registrable' } };
}

/** The answer as a validating resolver gave it, or as it came with CD after a SERVFAIL. */
function effectiveRcode(a: DnsAnswer): string | null {
  if (a.transportError) return null;
  const retried = a.retriedWithCd?.rcode;
  if (a.rcode === 'SERVFAIL' && (retried === 'NOERROR' || retried === 'NXDOMAIN')) return retried;
  return a.rcode;
}

const isBogus = (a: DnsAnswer) =>
  !a.transportError &&
  a.rcode === 'SERVFAIL' &&
  (a.ede.some((e) => isDnssecEde(e.code)) ||
    a.retriedWithCd?.rcode === 'NOERROR' ||
    a.retriedWithCd?.rcode === 'NXDOMAIN');

const trimDot = (name: string) => name.replace(/\.$/, '');

/** Plain, serialisable data per type. TXT fragments are joined, as resolvers' clients do. */
function data(type: RecordType, value: unknown): DnsRecordData {
  if (type === 'TXT')
    return Array.isArray(value) ? value.map(String).join('') : String(value ?? '');
  const v = (value ?? {}) as Record<string, unknown>;
  if (type === 'MX')
    return { priority: Number(v.preference), exchange: trimDot(String(v.exchange)) };
  if (type === 'CAA') return { flags: Number(v.flags), tag: String(v.tag), value: String(v.value) };
  if (type === 'SOA')
    return {
      mname: trimDot(String(v.mname)),
      rname: trimDot(String(v.rname)),
      serial: Number(v.serial),
      refresh: Number(v.refresh),
      retry: Number(v.retry),
      expire: Number(v.expire),
      minimum: Number(v.minimum),
    };
  return trimDot(String(value));
}

function recordSet(type: RecordType, a: DnsAnswer): DnsRecordSet {
  const rcode = effectiveRcode(a);
  if (rcode === 'NXDOMAIN') return { state: 'empty', records: [] };
  if (rcode !== 'NOERROR') return { state: 'failed', records: [] };
  const records = a.records
    .filter((r) => r.type === type)
    .map((r) => ({ name: trimDot(r.name), ttl: r.ttl, data: data(type, r.data) }));
  return { state: records.length ? 'ok' : 'empty', records };
}

const txtStarting = (a: DnsAnswer | null, prefix: string) =>
  (a?.records ?? [])
    .filter((r) => r.type === 'TXT')
    .some((r) => String(data('TXT', r.data)).toLowerCase().startsWith(prefix));

export function analyzeDns(
  target: { input: string; host: HostInfo; scope: DnsScope },
  observation: DnsObservation,
): DnsLookup {
  const { name, alternative } = dnsNames(target.host, target.scope);
  const answers = RECORD_TYPES.map((type) => observation.answers[type]);
  const rcodes = answers.map(effectiveRcode);
  const bogus = answers.some(isBogus);

  const outcome: DnsLookup['outcome'] = rcodes.includes('NXDOMAIN')
    ? 'nxdomain'
    : rcodes.includes('NOERROR') || bogus
      ? 'exists'
      : 'failed';

  const answered = answers.filter((a, i) => rcodes[i] === 'NOERROR' || rcodes[i] === 'NXDOMAIN');
  const dnssec: DnsLookup['dnssec'] = bogus
    ? 'bogus'
    : outcome === 'failed'
      ? 'unknown'
      : answered.every((a) => a.ad)
        ? 'validated'
        : 'unsigned';

  const records = Object.fromEntries(
    RECORD_TYPES.map((type) => [type, recordSet(type, observation.answers[type])]),
  ) as Record<RecordType, DnsRecordSet>;

  const warnings: MessageRef[] = [];
  if (outcome === 'nxdomain') warnings.push({ code: 'dns.nxdomain' });
  if (outcome === 'failed') warnings.push({ code: 'dns.failed' });
  if (dnssec === 'bogus') warnings.push({ code: 'dns.bogus' });
  if (dnssec === 'unsigned') warnings.push({ code: 'dns.unsigned' });
  // CAA is inherited from the parent and mail records belong to the domain, not to a host:
  // the configuration checks only apply to a lookup of the registrable domain.
  if (outcome === 'exists' && name.ascii === target.host.registrable) {
    if (records.CAA.state === 'empty') warnings.push({ code: 'dns.no-caa' });
    if (!txtStarting(observation.answers.TXT, 'v=spf1')) warnings.push({ code: 'dns.no-spf' });
    if (!txtStarting(observation.dmarc, 'v=dmarc1')) warnings.push({ code: 'dns.no-dmarc' });
  }

  return {
    input: target.input,
    name,
    alternative,
    outcome,
    dnssec,
    resolver: observation.resolver,
    records,
    warnings,
  };
}
