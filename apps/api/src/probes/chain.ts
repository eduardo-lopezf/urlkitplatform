/**
 * Chain probe of the v2 tools (002/T020, research R3). It runs the pure Redirect Inspector logic
 * over the same safe client, and keeps what the final hop returned: its raw headers and, for
 * Metadata, up to 1 MiB of its HTML body. One request per hop; the probe never decides anything.
 */
import { inspect, type FetchChain, type FinalResponse } from '@urlkit/core';
import { createFetchHop } from '../inspect/fetch-hop.ts';
import type { SafeFetch } from '../inspect/safe-fetch.ts';

/** Body cap of Metadata. 2xx HTML hops read up to this much in `html` mode (R4). */
export const METADATA_BODY_BYTES = 1024 * 1024;

export function createFetchChain({
  safeFetch,
  ...limits
}: {
  safeFetch: SafeFetch;
  hopTimeoutMs?: number;
  totalTimeoutMs?: number;
}): FetchChain {
  return async (url, { body }) => {
    let last: FinalResponse | null = null;
    const fetchHop = createFetchHop({
      safeFetch,
      ...limits,
      ...(body === 'html' ? { maxBodyBytes: METADATA_BODY_BYTES } : {}),
      observe: (response) => {
        last = response;
      },
    });
    const result = await inspect(url, fetchHop);
    if (!result.ok) return result;
    const chain = result.value;
    const final = chain.stopReason === 'final' ? (last as FinalResponse | null) : null;
    return {
      ok: true,
      value: {
        chain,
        finalResponse:
          final && body === 'none' ? { ...final, body: null, bodyTruncated: false } : final,
      },
    };
  };
}
