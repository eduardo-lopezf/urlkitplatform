/**
 * Outbound HTTP client of Redirect Inspector (T070). The full SSRF surface ships here:
 *
 * - resolve once, validate all addresses, connect to the validated one (custom `lookup` that
 *   returns only the pinned address, so undici can never resolve the name again);
 * - `maxRedirections: 0`: the service follows hops itself so each one is revalidated;
 * - an explicit dispatcher, so proxy environment variables are never honoured (a proxy would
 *   break IP pinning);
 * - scheme, credentials and port checks on every hop; no cookies are sent or stored.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { Agent, request } from 'undici';
import {
  DEFAULT_POLICY,
  resolveTarget,
  type BlockReason,
  type Policy,
  type Resolver,
} from './ssrf.ts';

export const USER_AGENT = 'URLkit-RedirectInspector/1.0 (+https://urlkit.example/about)';

export interface TransportResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  /** `null` when there is no body to read. */
  body: (AsyncIterable<Uint8Array> & { destroy?(): void }) | null;
}

/** Connects to `address` (already validated) and performs one GET of `url`. */
export type Transport = (req: {
  url: URL;
  address: string;
  family: 4 | 6;
  signal: AbortSignal;
}) => Promise<TransportResponse>;

export type SafeFetchResult =
  { kind: 'blocked'; reason: BlockReason } | ({ kind: 'response' } & TransportResponse);

export type SafeFetch = (url: string, signal: AbortSignal) => Promise<SafeFetchResult>;

export const systemResolver: Resolver = async (hostname) => {
  try {
    return (await dnsLookup(hostname, { all: true, verbatim: true })).map((a) => a.address);
  } catch {
    return [];
  }
};

export const undiciTransport: Transport = async ({ url, address, family, signal }) => {
  const pinned = (
    _host: string,
    options: { all?: boolean },
    callback: (...args: unknown[]) => void,
  ) => {
    if (options.all) callback(null, [{ address, family } satisfies LookupAddress]);
    else callback(null, address, family);
  };
  const agent = new Agent({
    connect: { lookup: pinned as never },
    keepAliveTimeout: 1,
    pipelining: 0,
  });
  try {
    const res = await request(url, {
      dispatcher: agent,
      method: 'GET',
      maxRedirections: 0,
      signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      },
    } as Parameters<typeof request>[1]);
    const body = res.body;
    body.on('error', () => undefined); // a body destroyed on purpose must not surface as an error
    body.once('close', () => void agent.close().catch(() => undefined));
    return { status: res.statusCode, headers: res.headers, body };
  } catch (error) {
    void agent.close().catch(() => undefined);
    throw error;
  }
};

export function createSafeFetch({
  resolve = systemResolver,
  policy = DEFAULT_POLICY,
  transport = undiciTransport,
}: { resolve?: Resolver; policy?: Policy; transport?: Transport } = {}): SafeFetch {
  return async (href, signal) => {
    const url = new URL(href);
    const target = await resolveTarget(url, resolve, policy);
    if (!target.ok) return { kind: 'blocked', reason: target.reason };
    return {
      kind: 'response',
      ...(await transport({ url, address: target.address, family: target.family, signal })),
    };
  };
}
