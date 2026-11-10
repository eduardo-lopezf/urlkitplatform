/**
 * Client of POST /v1/inspect (T074), typed from packages/contracts (consumer side of the
 * contract, Principio IX). Reads RateLimit-* and Retry-After so the island can explain the limit.
 */
import type { RedirectChainSchema, ToolErrorSchema, z } from '@urlkit/contracts';
import { API_URL } from './config.ts';

export type RedirectChain = z.infer<typeof RedirectChainSchema>;
export type ApiError = z.infer<typeof ToolErrorSchema>;

export interface RateInfo {
  limit: number | null;
  remaining: number | null;
  resetSeconds: number | null;
}

export type InspectOutcome =
  | { kind: 'ok'; chain: RedirectChain; rate: RateInfo }
  | { kind: 'quota'; retryAfterSeconds: number; rate: RateInfo }
  | { kind: 'invalid'; error: ApiError }
  | { kind: 'network' };

const num = (value: string | null) =>
  value === null || value === '' || Number.isNaN(Number(value)) ? null : Number(value);

export async function inspect(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InspectOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`${API_URL}/v1/inspect`, {
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch {
    return { kind: 'network' };
  }
  const rate: RateInfo = {
    limit: num(res.headers.get('RateLimit-Limit')),
    remaining: num(res.headers.get('RateLimit-Remaining')),
    resetSeconds: num(res.headers.get('RateLimit-Reset')),
  };
  try {
    if (res.status === 200) return { kind: 'ok', chain: (await res.json()) as RedirectChain, rate };
    if (res.status === 429) {
      const body = (await res.json().catch(() => ({}))) as Partial<ApiError>;
      const retry =
        num(res.headers.get('Retry-After')) ?? body.retryAfterSeconds ?? rate.resetSeconds ?? 3600;
      return { kind: 'quota', retryAfterSeconds: retry, rate };
    }
    if (res.status === 400) return { kind: 'invalid', error: (await res.json()) as ApiError };
  } catch {
    // Unreadable body: treated as a network problem below.
  }
  return { kind: 'network' };
}
