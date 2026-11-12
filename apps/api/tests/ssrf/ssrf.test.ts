/**
 * Runs the language-neutral vectors of tests/ssrf-vectors/vectors.json (T065) against every
 * outbound connector of the API (002/T011, research R11). Adding a vector there never requires
 * touching this suite. No real network: a fake resolver answers DNS and a fake transport records
 * every address the client would connect to.
 */
import { EventEmitter } from 'node:events';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inspect, tlsTool } from '@urlkit/core';
import { catalog } from '@urlkit/rules';
import { createFetchHop } from '../../src/inspect/fetch-hop.ts';
import { createSafeFetch, type Transport } from '../../src/inspect/safe-fetch.ts';
import { isBlockedAddress } from '../../src/inspect/ssrf.ts';
import { createProbeTls, type TlsConnect } from '../../src/probes/tls/connect.ts';

interface Vector {
  id: string;
  url: string;
  dns?: Record<string, string[][]>;
  redirects?: Record<string, string>;
  expect: {
    verdict: 'allow' | 'block';
    reason?: string;
    atHop?: number;
    neverConnectTo?: string[];
  };
}

const file = JSON.parse(
  readFileSync(new URL('../../../../tests/ssrf-vectors/vectors.json', import.meta.url), 'utf8'),
) as { vectors: Vector[] };

function harness(vector: Vector) {
  const resolutions = new Map<string, number>();
  const connected: string[] = [];
  const resolve = async (hostname: string) => {
    const answers = vector.dns?.[hostname] ?? [[]];
    const n = resolutions.get(hostname) ?? 0;
    resolutions.set(hostname, n + 1);
    return answers[Math.min(n, answers.length - 1)] ?? [];
  };
  const transport: Transport = async ({ url, address }) => {
    connected.push(address);
    const location = vector.redirects?.[url.href];
    return location
      ? { status: 302, headers: { location }, rawHeaders: [['location', location]], body: null }
      : {
          status: 200,
          headers: { 'content-type': 'text/html' },
          rawHeaders: [['content-type', 'text/html']],
          body: null,
        };
  };
  const fetchHop = createFetchHop({ safeFetch: createSafeFetch({ resolve, transport }) });
  return { fetchHop, connected };
}

/**
 * Every module that opens outbound connections to a destination chosen by the person. A new
 * connector joins this list, and the guard below fails while it is missing (research R11).
 */
const CONNECTORS = [
  { name: 'safeFetch (inspector, headers, metadata)', module: 'inspect/safe-fetch.ts' },
  { name: 'TLS connector', module: 'probes/tls/connect.ts' },
] as const;

/** Same fake DNS as `harness`; the fake socket records the address and refuses the connection. */
function tlsHarness(vector: Vector) {
  const resolutions = new Map<string, number>();
  const connected: string[] = [];
  const resolve = async (hostname: string) => {
    const answers = vector.dns?.[hostname] ?? [[]];
    const n = resolutions.get(hostname) ?? 0;
    resolutions.set(hostname, n + 1);
    return answers[Math.min(n, answers.length - 1)] ?? [];
  };
  const connect: TlsConnect = (options) => {
    connected.push(String(options.host));
    const socket = Object.assign(new EventEmitter(), { destroy: () => undefined });
    queueMicrotask(() =>
      socket.emit('error', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })),
    );
    return socket as unknown as ReturnType<TlsConnect>;
  };
  return { probeTls: createProbeTls({ resolve, connect }), connected };
}

/**
 * TLS sends no URL and follows no redirect, so only the vectors about the connection itself
 * apply: the allowed ones and those blocked at the first hop by address, port or resolution.
 * Credentials, schemes and redirects are properties of a URL request, covered by safeFetch.
 */
const TLS_REASONS = new Set(['private-address', 'port', 'unresolvable']);
const tlsVectors = () =>
  file.vectors.filter(
    (v) =>
      v.expect.verdict === 'allow' ||
      ((v.expect.atHop ?? 0) === 0 && TLS_REASONS.has(v.expect.reason ?? '')),
  );

/** Modules under src/probes that connect only to fixed, non user-chosen destinations. */
const FIXED_DESTINATION_MODULES: readonly string[] = [
  // DoH to Cloudflare and Quad9 only, pinned to fixed public addresses (002 research R6)
  'probes/dns/doh.ts',
];

const SOCKET_IMPORT = /from ['"](?:node:)?(?:net|tls|http|https|dgram)['"]|from ['"]undici['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('SSRF connectors', () => {
  it('lists every probe module that opens sockets', () => {
    const src = fileURLToPath(new URL('../../src/', import.meta.url));
    const probes = join(src, 'probes');
    const listed = new Set<string>([
      ...CONNECTORS.map((c) => c.module),
      ...FIXED_DESTINATION_MODULES,
    ]);
    const unlisted = sourceFiles(probes)
      .map((path) => path.slice(src.length))
      .filter((path) => SOCKET_IMPORT.test(readFileSync(join(src, path), 'utf8')))
      .filter((path) => !listed.has(path));
    expect(unlisted).toEqual([]);
  });
});

describe(`SSRF vectors: ${CONNECTORS[0].name}`, () => {
  it('loads the shared vector set', () => {
    expect(file.vectors.length).toBeGreaterThanOrEqual(60);
  });

  it.each(file.vectors.map((v) => [v.id, v] as const))('%s', async (_id, vector) => {
    const { fetchHop, connected } = harness(vector);
    const result = await inspect(vector.url, fetchHop);

    if (vector.expect.verdict === 'allow') {
      expect(result).toMatchObject({ ok: true, value: { stopReason: 'final' } });
      expect(connected.length).toBeGreaterThan(0);
    } else if (!result.ok) {
      // Inputs that are not http(s) are rejected by the core before any request.
      expect(vector.expect.reason).toBe('scheme');
      expect(result.error.code).toBe('url.unsupported-scheme');
      expect(connected).toEqual([]);
    } else {
      expect(result.value.stopReason).toBe('blocked');
      const hop = result.value.hops[vector.expect.atHop ?? 0];
      expect(hop?.error?.code).toBe(`inspect.blocked.${vector.expect.reason}`);
      expect(result.value.hops).toHaveLength((vector.expect.atHop ?? 0) + 1);
      expect(connected).toHaveLength(vector.expect.atHop ?? 0);
    }
    for (const address of vector.expect.neverConnectTo ?? [])
      expect(connected).not.toContain(address);
    for (const address of connected) expect(isBlockedAddress(address)).toBe(false);
  });
});

describe(`SSRF vectors: ${CONNECTORS[1].name}`, () => {
  it('applies to most of the shared set', () => {
    expect(tlsVectors().length).toBeGreaterThanOrEqual(60);
  });

  it.each(tlsVectors().map((v) => [v.id, v] as const))('%s', async (_id, vector) => {
    const { probeTls, connected } = tlsHarness(vector);
    const result = await tlsTool.run({ target: vector.url }, { probeTls, catalog });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (vector.expect.verdict === 'allow') {
      expect(result.value.blocked).toBeUndefined();
      expect(connected.length).toBe(1);
    } else {
      expect(result.value.blocked?.code).toBe(`inspect.blocked.${vector.expect.reason}`);
      expect(connected).toEqual([]);
    }
    for (const address of vector.expect.neverConnectTo ?? [])
      expect(connected).not.toContain(address);
    for (const address of connected) expect(isBlockedAddress(address)).toBe(false);
  });
});

describe('address ranges', () => {
  it('blocks every internal range and allows public addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.1.1',
      '172.20.0.1',
      '192.168.0.1',
      '169.254.169.254',
      '100.100.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      '::',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      'ff02::1',
      '2001:db8::1',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
    for (const ip of [
      '8.8.8.8',
      '93.184.216.34',
      '2606:4700:4700::1111',
      '::ffff:8.8.8.8',
      '64:ff9b::808:808',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it('treats anything that is not an IP as blocked', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});
