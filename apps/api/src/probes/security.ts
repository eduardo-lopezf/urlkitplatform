/**
 * Network adapters of Security Analysis with their time budgets (002/T084, research R7): the
 * chain and its headers get 6 s, then TLS and DNS run in parallel with 4 s, so the whole review
 * stays within 10 s (SC-001). A part that runs out resolves to its own timeout observation
 * (`inspect.timeout`, `tls.timeout`, unavailable DNS) instead of rejecting, and the core marks it
 * incomplete. The adapters are the same ones the other tools use, only with shorter limits.
 */
import type { FetchChain, ProbeTls, QueryDns } from '@urlkit/core';
import { HOP_TIMEOUT_MS } from '../inspect/fetch-hop.ts';
import type { SafeFetch } from '../inspect/safe-fetch.ts';
import { createFetchChain } from './chain.ts';
import { createQueryDns, QUERY_TIMEOUT_MS } from './dns/doh.ts';
import { createProbeTls } from './tls/connect.ts';

export const SECURITY_BUDGETS = { chainMs: 6000, networkMs: 4000 } as const;

export interface SecurityAdapters {
  fetchChain: FetchChain;
  probeTls: ProbeTls;
  queryDns: QueryDns;
}

export function createSecurityAdapters({
  safeFetch,
  tls = {},
  dns = {},
  budgets = SECURITY_BUDGETS,
}: {
  safeFetch: SafeFetch;
  tls?: Omit<NonNullable<Parameters<typeof createProbeTls>[0]>, 'timeoutMs'>;
  dns?: Omit<
    NonNullable<Parameters<typeof createQueryDns>[0]>,
    'totalTimeoutMs' | 'queryTimeoutMs'
  >;
  budgets?: { chainMs: number; networkMs: number };
}): SecurityAdapters {
  return {
    fetchChain: createFetchChain({
      safeFetch,
      totalTimeoutMs: budgets.chainMs,
      hopTimeoutMs: Math.min(HOP_TIMEOUT_MS, budgets.chainMs),
    }),
    probeTls: createProbeTls({ ...tls, timeoutMs: budgets.networkMs }),
    queryDns: createQueryDns({
      ...dns,
      totalTimeoutMs: budgets.networkMs,
      queryTimeoutMs: Math.min(QUERY_TIMEOUT_MS, budgets.networkMs),
    }),
  };
}
