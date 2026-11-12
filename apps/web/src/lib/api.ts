/**
 * Client of the server-side tools (T074; generalised in 002/T023), typed from packages/contracts
 * (consumer side of the contract, Principio IX). Reads RateLimit-* and Retry-After so each island
 * can explain the limit. The input travels only in the JSON body, never in the URL.
 */
import type {
  HeadersAnalysisSchema,
  PageMetadataSchema,
  TlsAnalysisSchema,
  DnsLookupSchema,
  SecurityReviewSchema,
  RedirectChainSchema,
  ToolErrorSchema,
  z,
} from '@urlkit/contracts';
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

/** Request and response of each server-side tool the web calls. */
export interface ServerTools {
  inspect: { request: { url: string }; response: RedirectChain };
  headers: { request: { url: string }; response: z.infer<typeof HeadersAnalysisSchema> };
  metadata: { request: { url: string }; response: z.infer<typeof PageMetadataSchema> };
  tls: { request: { target: string }; response: z.infer<typeof TlsAnalysisSchema> };
  dns: {
    request: { target: string; scope: 'host' | 'registrable' };
    response: z.infer<typeof DnsLookupSchema>;
  };
  security: { request: { url: string }; response: z.infer<typeof SecurityReviewSchema> };
}

export type ServerTool = keyof ServerTools;

export type ToolOutcome<T> =
  | { kind: 'ok'; value: T; rate: RateInfo }
  | { kind: 'quota'; retryAfterSeconds: number; rate: RateInfo }
  | { kind: 'invalid'; error: ApiError }
  | { kind: 'unavailable'; error: ApiError; rate: RateInfo }
  | { kind: 'network' };

const num = (value: string | null) =>
  value === null || value === '' || Number.isNaN(Number(value)) ? null : Number(value);

export async function callTool<K extends ServerTool>(
  tool: K,
  body: ServerTools[K]['request'],
  fetchImpl: typeof fetch = fetch,
): Promise<ToolOutcome<ServerTools[K]['response']>> {
  let res: Response;
  try {
    res = await fetchImpl(`${API_URL}/v1/${tool}`, {
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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
    if (res.status === 200)
      return { kind: 'ok', value: (await res.json()) as ServerTools[K]['response'], rate };
    if (res.status === 429) {
      const error = (await res.json().catch(() => ({}))) as Partial<ApiError>;
      const retry =
        num(res.headers.get('Retry-After')) ?? error.retryAfterSeconds ?? rate.resetSeconds ?? 3600;
      return { kind: 'quota', retryAfterSeconds: retry, rate };
    }
    if (res.status === 400) return { kind: 'invalid', error: (await res.json()) as ApiError };
    if (res.status === 503)
      return { kind: 'unavailable', error: (await res.json()) as ApiError, rate };
  } catch {
    // Unreadable body: treated as a network problem below.
  }
  return { kind: 'network' };
}

/** Redirect Inspector, on top of callTool. Same outcomes as before 002/T023. */
export async function inspect(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InspectOutcome> {
  const outcome = await callTool('inspect', { url }, fetchImpl);
  if (outcome.kind === 'ok') return { kind: 'ok', chain: outcome.value, rate: outcome.rate };
  if (outcome.kind === 'unavailable') return { kind: 'network' };
  return outcome;
}
