/**
 * Codes owned by the contract, not by the core: authenticating, limiting and validating the
 * request are the adapter's job (Principio VIII, research R20). The core owns URL semantics.
 */
import { CODES, ERROR_CODES } from '@urlkit/core/codes';

export const CONTRACT_CODES = [
  'quota.exceeded',
  /** Reserved for v3 (API keys). Never emitted in the MVP. */
  'auth.missing',
  /** Reserved for v3 (API keys). Never emitted in the MVP. */
  'auth.invalid',
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
