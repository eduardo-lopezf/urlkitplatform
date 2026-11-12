/** What the TLS connector observed (002 data-model.md, TlsObservation). No judgement here. */
import type { MessageCode } from '../../codes.ts';

export interface CertObservation {
  subject: string;
  issuer: string;
  subjectAltNames: string[];
  serialNumber: string;
  /** ISO 8601. */
  validFrom: string;
  validTo: string;
  signatureAlgorithm: string;
  fingerprint256: string;
  isCa: boolean;
  selfIssued: boolean;
  /** Only computed for the leaf. */
  sct?: { status: 'embedded' | 'absent' | 'unknown'; count: number };
}

export interface TlsObservation {
  kind: 'handshake';
  /** ISO 8601 instant of the handshake; the core never reads the clock. */
  observedAt: string;
  host: string;
  port: number;
  sniSent: boolean;
  protocol: string | null;
  cipher: string | null;
  alpn: string | null;
  authorized: boolean;
  /** OpenSSL verification error code (e.g. `CERT_HAS_EXPIRED`), or `null`. */
  authorizationError: string | null;
  hostMatches: boolean;
  /** From leaf to root. */
  chain: CertObservation[];
}

/** The connection was not attempted (SSRF block) or failed before a handshake. */
export type TlsFailure =
  { kind: 'blocked'; code: MessageCode } | { kind: 'error'; code: MessageCode };

export type ProbeTls = (target: {
  host: string;
  port: number;
  sni: boolean;
}) => Promise<TlsObservation | TlsFailure>;
