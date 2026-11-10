/** Redirect Inspector model (data-model.md, RedirectChain/Hop). Pure: no network here. */
import type { MessageCode } from '../../codes.ts';
import type { MessageRef } from '../../types.ts';

export type HopType =
  'permanent' | 'temporary' | 'meta-refresh' | 'javascript' | 'interstitial' | 'final';
export type HopFlag = 'https-downgrade' | 'domain-change';
export type StopReason = 'final' | 'loop' | 'max-hops' | 'blocked' | 'error' | 'timeout';

export interface Hop {
  index: number;
  url: string;
  status: number | null;
  type: HopType;
  location: string | null;
  durationMs: number;
  flags: HopFlag[];
  error?: MessageRef;
}

export interface RedirectChain {
  input: string;
  hops: Hop[];
  final: string | null;
  stopReason: StopReason;
  totalMs: number;
}

/** What the network adapter observed for one request. The core decides what it means. */
export type HopResponse =
  | {
      kind: 'response';
      status: number;
      /** Raw `Location` header, unresolved. */
      location: string | null;
      /** First bytes of the body, only for HTML responses (≤ 256 KB). */
      html: string | null;
      durationMs: number;
    }
  | { kind: 'blocked'; code: MessageCode; durationMs: number }
  | {
      kind: 'error';
      code: 'inspect.timeout' | 'inspect.tls' | 'inspect.network';
      durationMs: number;
    };

export type FetchHop = (url: string) => Promise<HopResponse>;
