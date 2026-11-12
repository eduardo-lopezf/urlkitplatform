/**
 * TLS evaluation (002/T055, research R5). Pure: it receives what the connector observed and
 * names each problem of the certificate. The mapping of OpenSSL errors to problems lives here,
 * never in the connector. The clock is never read: dates are compared with `observedAt`.
 */
import type { MessageRef } from '../../types.ts';
import type { HostInfo } from '../../url/host.ts';
import type { RuleCatalog } from '../clean/catalog.ts';
import type { CertObservation, TlsFailure, TlsObservation } from './types.ts';

export interface Certificate {
  subject: string;
  issuer: string;
  subjectAltNames: string[];
  serialNumber: string;
  validFrom: string;
  validTo: string;
  /** Whole days from the observation to `validTo`; negative once expired. */
  daysRemaining: number;
  signatureAlgorithm: string;
  fingerprint256: string;
  isCa: boolean;
}

export interface TlsAnalysis {
  input: string;
  host: { unicode: string; ascii: string } | { ip: string };
  port: number;
  /** `inspect.blocked.*`: the connection was never attempted. */
  blocked?: MessageRef;
  protocol: string | null;
  cipher: string | null;
  alpn: string | null;
  sniSent: boolean;
  trust?: 'trusted' | 'untrusted';
  chain: Certificate[];
  problems: MessageRef[];
  transparency: { status: 'embedded' | 'absent' | 'unknown'; count: number };
  error?: MessageRef;
  catalogVersion: string;
}

const DAY_MS = 86_400_000;

/** OpenSSL verification errors (`authorizationError`) and the problem each one means. */
const OPENSSL: Record<string, MessageRef['code']> = {
  CERT_HAS_EXPIRED: 'tls.expired',
  CERT_NOT_YET_VALID: 'tls.not-yet-valid',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'tls.self-signed',
  SELF_SIGNED_CERT_IN_CHAIN: 'tls.self-signed',
  UNABLE_TO_GET_ISSUER_CERT: 'tls.incomplete-chain',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'tls.incomplete-chain',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'tls.incomplete-chain',
};

/** Fixed order of problems in the result, so the same observation always reads the same. */
const ORDER: Array<MessageRef['code']> = [
  'tls.expired',
  'tls.not-yet-valid',
  'tls.self-signed',
  'tls.incomplete-chain',
  'tls.untrusted-root',
  'tls.name-mismatch',
  'tls.expiring-soon',
  'tls.weak-signature',
  'tls.legacy-protocol',
];

export function analyzeTls(
  target: { input: string; host: HostInfo; port: number },
  observation: TlsObservation | TlsFailure,
  catalog: RuleCatalog,
): TlsAnalysis {
  const criteria = catalog.security?.tls;
  if (!criteria) throw new Error('tls needs the security criteria of the catalog');
  const { host } = target;
  const base = {
    input: target.input,
    host: host.kind === 'ip' ? { ip: host.ascii } : { unicode: host.unicode, ascii: host.ascii },
    port: target.port,
    catalogVersion: catalog.version,
  };

  if (observation.kind !== 'handshake') {
    return {
      ...base,
      ...(observation.kind === 'blocked'
        ? { blocked: { code: observation.code } }
        : { error: { code: observation.code } }),
      protocol: null,
      cipher: null,
      alpn: null,
      sniSent: host.kind === 'name',
      chain: [],
      problems: [],
      transparency: { status: 'unknown', count: 0 },
    };
  }

  const now = Date.parse(observation.observedAt);
  const chain = observation.chain.map((c) => certificate(c, now));
  const leaf = observation.chain[0];
  const found = new Map<string, MessageRef>();
  const add = (ref: MessageRef) => {
    if (!found.has(ref.code)) found.set(ref.code, ref);
  };
  const day = (iso: string | undefined) => (iso ?? '').slice(0, 10);

  const fromOpenSsl = observation.authorizationError
    ? (OPENSSL[observation.authorizationError] ?? 'tls.untrusted-root')
    : null;
  if (fromOpenSsl === 'tls.expired')
    add({ code: fromOpenSsl, params: { date: day(leaf?.validTo) } });
  else if (fromOpenSsl === 'tls.not-yet-valid')
    add({ code: fromOpenSsl, params: { date: day(leaf?.validFrom) } });
  else if (fromOpenSsl === 'tls.untrusted-root')
    add({ code: fromOpenSsl, params: { reason: observation.authorizationError ?? '' } });
  else if (fromOpenSsl) add({ code: fromOpenSsl });

  if (leaf) {
    const days = chain[0]?.daysRemaining ?? 0;
    if (Date.parse(leaf.validTo) < now)
      add({ code: 'tls.expired', params: { date: day(leaf.validTo) } });
    else if (days < criteria.expiringSoonDays) add({ code: 'tls.expiring-soon', params: { days } });
    if (Date.parse(leaf.validFrom) > now)
      add({ code: 'tls.not-yet-valid', params: { date: day(leaf.validFrom) } });
  }
  if (!observation.hostMatches) add({ code: 'tls.name-mismatch' });

  // A trust anchor's own signature is never checked, so only non-root certificates count.
  const weak = observation.chain.find(
    (c) =>
      !c.selfIssued &&
      criteria.weakSignatures.some((hash) => c.signatureAlgorithm.toLowerCase().includes(hash)),
  );
  if (weak) add({ code: 'tls.weak-signature', params: { algorithm: weak.signatureAlgorithm } });
  if (observation.protocol && criteria.legacyProtocols.includes(observation.protocol))
    add({ code: 'tls.legacy-protocol', params: { protocol: observation.protocol } });

  return {
    ...base,
    protocol: observation.protocol,
    cipher: observation.cipher,
    alpn: observation.alpn,
    sniSent: observation.sniSent,
    trust: observation.authorized && observation.hostMatches ? 'trusted' : 'untrusted',
    chain,
    problems: ORDER.flatMap((code) => {
      const ref = found.get(code);
      return ref ? [ref] : [];
    }),
    transparency: leaf?.sct ?? { status: 'unknown', count: 0 },
  };
}

function certificate(c: CertObservation, now: number): Certificate {
  return {
    subject: c.subject,
    issuer: c.issuer,
    subjectAltNames: c.subjectAltNames,
    serialNumber: c.serialNumber,
    validFrom: c.validFrom,
    validTo: c.validTo,
    daysRemaining: Math.floor((Date.parse(c.validTo) - now) / DAY_MS),
    signatureAlgorithm: c.signatureAlgorithm,
    fingerprint256: c.fingerprint256,
    isCa: c.isCa,
  };
}
