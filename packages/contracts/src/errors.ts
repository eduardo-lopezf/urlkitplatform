/**
 * Codes owned by the contract, not by the core: authenticating, limiting and validating the
 * request are the adapter's job (Principio VIII, research R20). The core owns URL semantics.
 */
import { CODES, ERROR_CODES } from '@urlkit/core/codes';

export const CONTRACT_CODES = [
  'quota.exceeded',
  /** Reserved: no endpoint requires a key yet (003, research R8). */
  'auth.missing',
  /**
   * An `Authorization` header that is present but not a valid key: empty, another scheme,
   * malformed, unknown, revoked, or of an inactive organization. Same body in every case (003).
   */
  'auth.invalid',
  /** The key could not be checked because its storage does not answer; retry later (003). */
  'auth.unavailable',
  /** The request body does not match the contract (wrong JSON, missing or mistyped field). */
  'request.invalid',
  /** The request body is larger than the accepted size. */
  'request.too-large',
  /** Unexpected server failure. The response never contains the input. */
  'internal.error',
] as const;

export type ContractCode = (typeof CONTRACT_CODES)[number];

/** Every code published in the OpenAPI `MessageCode` enum. */
export const MESSAGE_CODES = [...CODES, ...CONTRACT_CODES] as const;

/** Codes allowed in `ToolError.code`. */
export const TOOL_ERROR_CODES = [...ERROR_CODES, ...CONTRACT_CODES] as const;
