/**
 * Anonymous usage beacon (T037, research R8). Sends only `{tool, outcome}`: no URL, no
 * identifier, no cookie. Failures and 429 responses are ignored silently.
 *
 * `fetch` with `keepalive` is used instead of `navigator.sendBeacon` because sendBeacon cannot
 * send `application/json` cross-origin, which is what the contract declares.
 */
import type { ToolId } from '@urlkit/core';
import { API_URL } from './config.ts';

export type Outcome = 'success' | 'error' | 'copied' | 'sent-to';

export function track(tool: ToolId, outcome: Outcome): void {
  try {
    void fetch(`${API_URL}/v1/metrics/events`, {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tool, outcome }),
    }).catch(() => undefined);
  } catch {
    // Metrics never break a tool.
  }
}

/** Counts one run per stable input: typing does not send one event per keystroke. */
export function runTracker(tool: ToolId, delayMs = 1500) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = '';
  return (key: string, ok: boolean) => {
    clearTimeout(timer);
    if (!key || key === last) return;
    timer = setTimeout(() => {
      last = key;
      track(tool, ok ? 'success' : 'error');
    }, delayMs);
  };
}
