/**
 * What Security Analysis checks after following the chain (002/T081, research R7). Choosing the
 * host is product logic, so it lives here: the destination is reviewed, not the shortener.
 */
import type { MessageRef } from '../../types.ts';
import { analyzeHost } from '../../url/host.ts';
import type { RedirectChain } from '../inspect/types.ts';

export type Skipped = { skipped: MessageRef };

export interface ReviewTargets {
  tls: { host: string; port: number; sni: boolean } | Skipped;
  /** The registrable domain carries DNSSEC, CAA, SPF and DMARC. */
  dns: { target: string; scope: 'registrable' } | Skipped;
}

const skip = (part: 'tls' | 'dns'): Skipped => ({
  skipped: { code: 'security.part-skipped', params: { part } },
});

export function reviewTargets(chain: RedirectChain): ReviewTargets {
  const last = chain.hops.at(-1);
  if (chain.stopReason === 'blocked') {
    const reason = last?.error ?? { code: 'inspect.blocked' };
    return { tls: { skipped: reason }, dns: { skipped: reason } };
  }
  // The final destination, or the hop where the chain stopped (e.g. a failed certificate).
  const url = chain.final ?? last?.url ?? chain.input;
  const host = analyzeHost(url);
  if (!host.ok) return { tls: skip('tls'), dns: skip('dns') };

  const https = url.toLowerCase().startsWith('https:');
  return {
    tls: https
      ? { host: host.value.ascii, port: host.value.port ?? 443, sni: host.value.kind === 'name' }
      : skip('tls'),
    dns:
      host.value.kind === 'name' && !host.value.specialUse
        ? { target: host.value.ascii, scope: 'registrable' }
        : skip('dns'),
  };
}
