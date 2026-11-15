/**
 * Optional retries (004, research R5). Off unless the integration passes `retries`. When on, only
 * 429 and 503 are retried, after the wait the API asked for (1 s when it said nothing), up to
 * `maxAttempts` in total. A wait longer than `maxWaitSeconds` returns the error at once, so the
 * integration decides. 401, other 4xx, transport errors and cancelled calls are never retried.
 */
import { UrlkitApiError, UrlkitTransportError } from './errors.ts';

export interface RetryOptions {
  /** Total attempts, counting the first one. Default 3. */
  maxAttempts?: number;
  /** Longest wait the integration accepts, in seconds. Default 60. */
  maxWaitSeconds?: number;
}

const RETRIABLE = new Set([429, 503]);
const DEFAULT_WAIT_SECONDS = 1;

/** Waits `seconds`, or rejects with `aborted` as soon as the signal fires. */
function wait(seconds: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new UrlkitTransportError('aborted'));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new UrlkitTransportError('aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, seconds * 1000);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function withRetries<T>(
  call: () => Promise<T>,
  options: RetryOptions | undefined,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (options === undefined) return call();
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const maxWaitSeconds = options.maxWaitSeconds ?? 60;
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      const retriable = error instanceof UrlkitApiError && RETRIABLE.has(error.status);
      if (!retriable || attempt >= maxAttempts) throw error;
      const seconds = error.retryAfterSeconds ?? DEFAULT_WAIT_SECONDS;
      if (seconds > maxWaitSeconds) throw error;
      await wait(seconds, signal);
    }
  }
}
