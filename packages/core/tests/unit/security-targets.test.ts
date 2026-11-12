/** Security Analysis: what is checked after following the chain (002/T075). */
import { describe, expect, it } from 'vitest';
import { reviewTargets, type Hop, type RedirectChain } from '../../src/index.ts';

function chain(
  urls: string[],
  stopReason: RedirectChain['stopReason'] = 'final',
  error?: Hop['error'],
): RedirectChain {
  const hops: Hop[] = urls.map((url, index) => ({
    index,
    url,
    status: stopReason === 'final' || index < urls.length - 1 ? 200 : null,
    type: index === urls.length - 1 ? 'final' : 'temporary',
    location: null,
    durationMs: 1,
    flags: [],
  }));
  if (error) hops[hops.length - 1] = { ...hops[hops.length - 1]!, error };
  return {
    input: urls[0] ?? '',
    hops,
    final: stopReason === 'final' ? (urls.at(-1) ?? null) : null,
    stopReason,
    totalMs: 1,
  };
}

describe('reviewTargets', () => {
  it('checks TLS and DNS of the final destination, not of the shortener', () => {
    expect(
      reviewTargets(chain(['https://bit.example/x', 'https://shop.example.com:8443/p'])),
    ).toEqual({
      tls: { host: 'shop.example.com', port: 8443, sni: true },
      dns: { target: 'shop.example.com', scope: 'registrable' },
    });
  });

  it('skips TLS when the destination is http', () => {
    const t = reviewTargets(chain(['https://bit.example/x', 'http://plain.example.com/']));
    expect(t.tls).toEqual({ skipped: { code: 'security.part-skipped', params: { part: 'tls' } } });
    expect(t.dns).toEqual({ target: 'plain.example.com', scope: 'registrable' });
  });

  it('skips every network part of a blocked chain, with the block reason', () => {
    const block = { code: 'inspect.blocked.private-address' } as const;
    const t = reviewTargets(chain(['http://10.0.0.1/'], 'blocked', block));
    expect(t).toEqual({ tls: { skipped: block }, dns: { skipped: block } });
  });

  it('checks TLS of the hop where the certificate failed', () => {
    const t = reviewTargets(
      chain(['https://bit.example/x', 'https://expired.example/'], 'error', {
        code: 'inspect.tls',
      }),
    );
    expect(t.tls).toEqual({ host: 'expired.example', port: 443, sni: true });
  });

  it('skips DNS for an IP literal destination', () => {
    const t = reviewTargets(chain(['https://93.184.215.14/']));
    expect(t.dns).toEqual({ skipped: { code: 'security.part-skipped', params: { part: 'dns' } } });
    expect(t.tls).toEqual({ host: '93.184.215.14', port: 443, sni: false });
  });
});
