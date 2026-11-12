/**
 * What the chain probe observed (002 data-model.md, ChainObservation). Shared by HTTP Headers,
 * Metadata and Security Analysis. The probe only observes; the core decides what it means.
 */
import type { Result } from '../../types.ts';
import type { RedirectChain } from '../inspect/types.ts';

/** The response of the last hop, as received. */
export interface FinalResponse {
  status: number;
  /** `[name, value]` in received order, original casing, repetitions kept. */
  rawHeaders: Array<[string, string]>;
  contentType: string | null;
  /** Only with `body: 'html'` on a 2xx HTML response; at most 1 MiB. */
  body: Uint8Array | null;
  bodyTruncated: boolean;
}

export interface ChainObservation {
  chain: RedirectChain;
  /** `null` when the chain did not end on a response (blocked, timeout, error, loop…). */
  finalResponse: FinalResponse | null;
}

export type FetchChain = (
  url: string,
  opts: { body: 'none' | 'html' },
) => Promise<Result<ChainObservation>>;
