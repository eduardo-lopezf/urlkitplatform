/**
 * TLS connector (002/T056, research R5). Same SSRF surface as the inspector: the name is
 * resolved once, every address is validated with `resolveTarget` and the socket connects to the
 * validated address only. It completes the handshake, writes no application data and closes.
 *
 * `rejectUnauthorized: false` lets an invalid certificate be shown (FR-042). Trust is not lost:
 * it is read from `authorized` / `authorizationError`. Node's own name check is disabled so the
 * chain verification and the name match are reported separately (`hostMatches`). The connector
 * only observes; what each error means is decided in the core.
 */
import { X509Certificate } from 'node:crypto';
import {
  connect as tlsConnect,
  type ConnectionOptions,
  type DetailedPeerCertificate,
  type TLSSocket,
} from 'node:tls';
import type { CertObservation, ProbeTls, TlsFailure, TlsObservation } from '@urlkit/core';
import { CLASSIC_GROUPS, systemResolver } from '../../inspect/safe-fetch.ts';
import { DEFAULT_POLICY, resolveTarget, type Policy, type Resolver } from '../../inspect/ssrf.ts';
import { readSct } from './x509.ts';

export const TLS_TIMEOUT_MS = 5000;

export type TlsConnect = (options: ConnectionOptions) => TLSSocket;

/** Socket errors before a handshake, by what they say about the port. */
function failure(error: unknown): TlsFailure {
  const e = error as { code?: string; message?: string };
  const text = `${e?.code ?? ''} ${e?.message ?? ''}`;
  if (/ECONNREFUSED/.test(text)) return { kind: 'error', code: 'tls.refused' };
  if (/ETIMEDOUT/.test(text)) return { kind: 'error', code: 'tls.timeout' };
  if (
    /WRONG_VERSION_NUMBER|PACKET_LENGTH|UNKNOWN_PROTOCOL|wrong version|packet length|http request/i.test(
      text,
    )
  )
    return { kind: 'error', code: 'tls.no-tls' };
  return { kind: 'error', code: 'tls.handshake-failed' };
}

const names = (dn: string) => dn.split('\n').filter(Boolean).join(', ');

function observeCert(x: X509Certificate): CertObservation {
  const validFrom = (x.validFromDate ?? new Date(x.validFrom)).toISOString();
  const validTo = (x.validToDate ?? new Date(x.validTo)).toISOString();
  return {
    subject: names(x.subject),
    issuer: names(x.issuer),
    subjectAltNames: x.subjectAltName ? x.subjectAltName.split(', ') : [],
    serialNumber: x.serialNumber,
    validFrom,
    validTo,
    signatureAlgorithm: x.signatureAlgorithm ?? '',
    fingerprint256: x.fingerprint256,
    isCa: x.ca,
    selfIssued: x.subject === x.issuer,
  };
}

/** The chain as Node built it, from leaf to root, without repeating the self-signed root. */
function peerChain(socket: TLSSocket): X509Certificate[] {
  const out: X509Certificate[] = [];
  const seen = new Set<string>();
  let current: DetailedPeerCertificate | undefined = socket.getPeerCertificate(true);
  while (current?.raw && !seen.has(current.fingerprint256)) {
    seen.add(current.fingerprint256);
    out.push(new X509Certificate(current.raw));
    const next: DetailedPeerCertificate | undefined = current.issuerCertificate;
    if (!next || next === current) break;
    current = next;
  }
  return out;
}

function authorizationCode(socket: TLSSocket): string | null {
  if (socket.authorized) return null;
  const error = socket.authorizationError as unknown;
  if (!error) return null;
  return typeof error === 'string' ? error : ((error as { code?: string }).code ?? String(error));
}

export function createProbeTls({
  resolve = systemResolver,
  policy = DEFAULT_POLICY,
  connect = tlsConnect,
  ca,
  timeoutMs = TLS_TIMEOUT_MS,
  now = () => new Date(),
}: {
  resolve?: Resolver;
  policy?: Policy;
  connect?: TlsConnect;
  /** Trust store override, for tests only. Production uses Node's bundled Mozilla roots. */
  ca?: Array<string | Buffer>;
  timeoutMs?: number;
  now?: () => Date;
} = {}): ProbeTls {
  return async ({ host, port, sni }) => {
    const target = await resolveTarget(new URL(`https://${host}:${port}/`), resolve, policy);
    if (!target.ok) return { kind: 'blocked', code: `inspect.blocked.${target.reason}` };
    const name = host.replace(/^\[|\]$/g, '');

    // One handshake, as a current browser makes it unless `groups` narrows the key exchange.
    // `reset` tells a server that cut the connection before the handshake finished.
    const attempt = (budgetMs: number, groups?: string) =>
      new Promise<{ result: TlsObservation | TlsFailure; reset: boolean }>((settle) => {
        let done = false;
        const socket = connect({
          host: target.address,
          port,
          ...(sni ? { servername: name } : {}),
          rejectUnauthorized: false,
          checkServerIdentity: () => undefined,
          ALPNProtocols: ['h2', 'http/1.1'],
          ...(groups ? { ecdhCurve: groups } : {}),
          ...(ca ? { ca } : {}),
        });
        const finish = (result: TlsObservation | TlsFailure, reset = false) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          socket.destroy();
          settle({ result, reset });
        };
        const timer = setTimeout(() => finish({ kind: 'error', code: 'tls.timeout' }), budgetMs);
        socket.once('error', (error) =>
          finish(failure(error), (error as { code?: string }).code === 'ECONNRESET'),
        );
        socket.once('secureConnect', () => {
          try {
            const chain = peerChain(socket);
            const leaf = chain[0];
            const observed = chain.map(observeCert);
            if (leaf && observed[0]) observed[0].sct = readSct(leaf.raw);
            const cipher = socket.getCipher();
            finish({
              kind: 'handshake',
              observedAt: now().toISOString(),
              host,
              port,
              sniSent: sni,
              protocol: socket.getProtocol(),
              cipher: cipher?.standardName ?? cipher?.name ?? null,
              alpn: socket.alpnProtocol || null,
              authorized: socket.authorized,
              authorizationError: authorizationCode(socket),
              hostMatches: leaf
                ? (sni ? leaf.checkHost(name) : leaf.checkIP(name)) !== undefined
                : false,
              chain: observed,
            });
          } catch (error) {
            finish(failure(error));
          }
        });
      });

    // The retry gets its own time limit: a cut can take seconds to arrive, and a shared limit
    // left the retry without time (measured against badssl.com, 2026-11-12). Only a server that
    // cut the first handshake ever waits longer than `timeoutMs`.
    const first = await attempt(timeoutMs);
    return first.reset ? (await attempt(timeoutMs, CLASSIC_GROUPS)).result : first.result;
  };
}
