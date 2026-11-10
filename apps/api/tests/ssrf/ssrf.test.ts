/**
 * Runs the language-neutral vectors of tests/ssrf-vectors/vectors.json (T065). Adding a vector
 * there never requires touching this suite. No real network: a fake resolver answers DNS and a
 * fake transport records every address the client would connect to.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inspect } from '@urlkit/core';
import { createFetchHop } from '../../src/inspect/fetch-hop.ts';
import { createSafeFetch, type Transport } from '../../src/inspect/safe-fetch.ts';
import { isBlockedAddress } from '../../src/inspect/ssrf.ts';

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
      ? { status: 302, headers: { location }, body: null }
      : { status: 200, headers: { 'content-type': 'text/html' }, body: null };
  };
  const fetchHop = createFetchHop({ safeFetch: createSafeFetch({ resolve, transport }) });
  return { fetchHop, connected };
}

describe('SSRF vectors', () => {
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
