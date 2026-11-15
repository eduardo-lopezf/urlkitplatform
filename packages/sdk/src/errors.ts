/**
 * Errors of the SDK (004, research R4). An integration decides by `instanceof` and by `code`,
 * which is public contract. Neither class keeps the request: their message is the code or the kind
 * of failure, never headers, the body or the API key (FR-014).
 */
import type { components } from './generated/openapi.ts';

/** A code of the contract, or a newer one kept as is. */
export type ErrorCode = components['schemas']['MessageCode'] | (string & {});

export interface RateLimit {
  limit: number;
  remaining: number;
  resetSeconds: number;
}

/** An error response of the API, with its contract code. */
export class UrlkitApiError extends Error {
  override readonly name = 'UrlkitApiError';
  readonly code: ErrorCode;
  readonly status: number;
  /** Seconds the API asked to wait (quota.exceeded, auth.unavailable). */
  readonly retryAfterSeconds: number | undefined;
  readonly rateLimit: RateLimit | null;

  constructor(details: {
    code: ErrorCode;
    status: number;
    retryAfterSeconds: number | undefined;
    rateLimit: RateLimit | null;
  }) {
    super(details.code);
    this.code = details.code;
    this.status = details.status;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.rateLimit = details.rateLimit;
  }
}

export type TransportFailure = 'network' | 'timeout' | 'aborted' | 'invalid-response';

/** The request did not get a contract answer: network, timeout, cancellation or a foreign reply. */
export class UrlkitTransportError extends Error {
  override readonly name = 'UrlkitTransportError';
  readonly kind: TransportFailure;
  /** The HTTP status, when a response arrived. */
  readonly status: number | undefined;

  constructor(kind: TransportFailure, status?: number) {
    super(kind);
    this.kind = kind;
    this.status = status;
  }
}
