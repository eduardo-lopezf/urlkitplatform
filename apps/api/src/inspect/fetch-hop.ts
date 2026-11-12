/**
 * Network adapter for one inspection (T071): GET with a 5 s per-hop timeout, a 15 s deadline for
 * the whole chain, and at most 256 KB of body read, only from HTML responses (to detect
 * `meta refresh` and JS redirects without executing them). Errors map to core codes.
 */
import type { FetchHop, FinalResponse, HopResponse } from '@urlkit/core';
import type { SafeFetch } from './safe-fetch.ts';

export const HOP_TIMEOUT_MS = 5000;
export const TOTAL_TIMEOUT_MS = 15_000;
export const MAX_BODY_BYTES = 256 * 1024;

const TLS_CODES =
  /^(?:CERT_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_|ERR_TLS_|ERR_SSL_|HOSTNAME_MISMATCH|ERR_TLS_CERT)/;

export function errorCode(error: unknown): 'inspect.timeout' | 'inspect.tls' | 'inspect.network' {
  const e = error as { name?: string; code?: string; cause?: { code?: string; name?: string } };
  const names = [e?.name, e?.cause?.name];
  const codes = [e?.code, e?.cause?.code].filter((c): c is string => typeof c === 'string');
  if (
    names.includes('TimeoutError') ||
    names.includes('AbortError') ||
    codes.some((c) => /TIMEOUT/.test(c))
  )
    return 'inspect.timeout';
  if (
    codes.some((c) => TLS_CODES.test(c)) ||
    /SSL|TLS|certificate/i.test(String((e as Error)?.message))
  )
    return 'inspect.tls';
  return 'inspect.network';
}

async function readHtml(
  body: AsyncIterable<Uint8Array> & { destroy?(): void },
  limit: number,
): Promise<{ text: string; bytes: Uint8Array; truncated: boolean }> {
  const decoder = new TextDecoder();
  const kept: Uint8Array[] = [];
  let text = '';
  let read = 0;
  let ended = true;
  for await (const chunk of body) {
    const room = limit - read;
    read += chunk.byteLength;
    const part = chunk.byteLength > room ? chunk.subarray(0, room) : chunk;
    kept.push(part);
    text += decoder.decode(part, { stream: true });
    if (read >= limit) {
      ended = false;
      break;
    }
  }
  body.destroy?.();
  return {
    text: text + decoder.decode(),
    bytes: Buffer.concat(kept),
    truncated: read > limit || !ended,
  };
}

/** What the v2 chain probe keeps of each response (002/T020); the inspector ignores it. */
export type ResponseObserver = (response: FinalResponse) => void;

export function createFetchHop({
  safeFetch,
  hopTimeoutMs = HOP_TIMEOUT_MS,
  totalTimeoutMs = TOTAL_TIMEOUT_MS,
  maxBodyBytes = MAX_BODY_BYTES,
  clock = () => performance.now(),
  observe,
}: {
  safeFetch: SafeFetch;
  hopTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxBodyBytes?: number;
  clock?: () => number;
  /** Called once per response, with its raw headers and the HTML bytes read (if any). */
  observe?: ResponseObserver;
}): FetchHop {
  const deadline = AbortSignal.timeout(totalTimeoutMs);
  return async (url): Promise<HopResponse> => {
    const started = clock();
    const elapsed = () => Math.round(clock() - started);
    if (deadline.aborted) return { kind: 'error', code: 'inspect.timeout', durationMs: 0 };
    // The hop's own controller: aborted by its timeout or the chain deadline, never after the hop.
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new DOMException('hop timeout', 'TimeoutError')),
      hopTimeoutMs,
    );
    const onDeadline = () => controller.abort(new DOMException('chain timeout', 'TimeoutError'));
    deadline.addEventListener('abort', onDeadline, { once: true });
    const signal = controller.signal;
    try {
      const res = await safeFetch(url, signal);
      if (res.kind === 'blocked')
        return { kind: 'blocked', code: `inspect.blocked.${res.reason}`, durationMs: elapsed() };
      const type = String(res.headers['content-type'] ?? '').toLowerCase();
      const location = res.headers.location;
      let html: string | null = null;
      let read: Awaited<ReturnType<typeof readHtml>> | null = null;
      if (res.body) {
        if (res.status >= 200 && res.status < 300 && type.includes('html')) {
          read = await readHtml(res.body, maxBodyBytes);
          html = read.text;
        } else res.body.destroy?.();
      }
      observe?.({
        status: res.status,
        rawHeaders: res.rawHeaders,
        contentType: type === '' ? null : String(res.headers['content-type']),
        body: read?.bytes ?? null,
        bodyTruncated: read?.truncated ?? false,
      });
      return {
        kind: 'response',
        status: res.status,
        location: Array.isArray(location) ? (location[0] ?? null) : (location ?? null),
        html,
        durationMs: elapsed(),
      };
    } catch (error) {
      return { kind: 'error', code: errorCode(error), durationMs: elapsed() };
    } finally {
      clearTimeout(timer);
      deadline.removeEventListener('abort', onDeadline);
    }
  };
}
