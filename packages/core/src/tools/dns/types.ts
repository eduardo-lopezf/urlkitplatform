/** What the DoH client observed (002 data-model.md, DnsObservation). No judgement here. */

export const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'CAA', 'SOA'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export type DnsResolverId = 'cloudflare' | 'quad9';

export interface DnsAnswer {
  /** `NOERROR`, `NXDOMAIN`, `SERVFAIL`… as in the response header. `null` on transport error. */
  rcode: string | null;
  ad: boolean;
  /** Extended DNS Errors (RFC 8914). */
  ede: Array<{ code: number; text?: string }>;
  /** `data` as decoded: string for A/AAAA/CNAME/NS, string[] for TXT, objects for MX/CAA/SOA. */
  records: Array<{ name: string; type: RecordType; ttl: number; data: unknown }>;
  /** Present when a SERVFAIL was retried with the CD bit (no validation). */
  retriedWithCd: { rcode: string | null } | null;
  transportError: boolean;
}

export interface DnsObservation {
  /** ISO 8601. */
  observedAt: string;
  /** ASCII name that was queried. */
  name: string;
  resolver: DnsResolverId;
  answers: Record<RecordType, DnsAnswer>;
  /** TXT of `_dmarc.<registrable>`, used for the DMARC warning. */
  dmarc: DnsAnswer | null;
}

export type QueryDns = (
  asciiName: string,
  opts: { dmarcOf: string | null },
) => Promise<DnsObservation | { kind: 'unavailable' }>;
