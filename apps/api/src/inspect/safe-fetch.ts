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
import { Agent, request, type Dispatcher } from 'undici';
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
  /** `[name, value]` exactly as received: order, casing and repetitions (002/T019). */
  rawHeaders: Array<[string, string]>;
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

/** Flat `[name, value, name, value…]` from the HTTP parser, as pairs. Header bytes are latin1. */
/**
 * Over HTTP/1.1 undici exposes the flat array from the parser. Over HTTP/2 it exposes the header
 * object instead: names come lower-cased, in received order, and repeated fields as arrays.
 */
export function headerPairs(raw: unknown): Array<[string, string]> {
  const text = (v: unknown) => (Buffer.isBuffer(v) ? v.toString('latin1') : String(v));
  const pairs: Array<[string, string]> = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i + 1 < raw.length; i += 2) pairs.push([text(raw[i]), text(raw[i + 1])]);
    return pairs;
  }
  if (raw && typeof raw === 'object')
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
      if (name.startsWith(':') || value === undefined) continue; // HTTP/2 pseudo-headers
      for (const v of Array.isArray(value) ? value : [value]) pairs.push([name, text(v)]);
    }
  return pairs;
}

/**
 * Interceptor that copies the raw headers of the response before `request()` groups them into
 * an object. Everything else is forwarded to undici's own handler untouched.
 */
function captureRawHeaders(sink: {
  raw: Array<[string, string]>;
}): Dispatcher.DispatcherComposeInterceptor {
  return (dispatch) => (options, handler) =>
    dispatch(
      options,
      new Proxy(handler, {
        get(target, prop, receiver) {
          const value: unknown = Reflect.get(target, prop, receiver);
          if (prop === 'onResponseStart' && typeof value === 'function')
            return (controller: Dispatcher.DispatchController, ...rest: unknown[]) => {
              sink.raw = headerPairs(controller.rawHeaders);
              return (value as (...a: unknown[]) => unknown).call(target, controller, ...rest);
            };
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    );
}

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
  const sink: { raw: Array<[string, string]> } = { raw: [] };
  try {
    const res = await request(url, {
      dispatcher: agent.compose(captureRawHeaders(sink)),
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
    return { status: res.statusCode, headers: res.headers, rawHeaders: sink.raw, body };
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
