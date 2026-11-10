/**
 * Shared types, exactly as in specs/001-mvp-url-toolkit/data-model.md.
 * The core never carries text for people: it returns codes with parameters (MessageRef).
 */
import type { CoreErrorCode, MessageCode } from './codes.ts';

export interface MessageRef {
  code: MessageCode;
  params?: Record<string, string | number>;
}

export interface ToolError {
  code: CoreErrorCode;
  message: MessageRef;
  /** Part of the input that caused the error (e.g. `host`, `port`, `scheme`). */
  part?: string;
  retryAfterSeconds?: number;
}

/** Every core operation that can fail on user input returns a Result instead of throwing. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: ToolError };

export type HostKind = 'domain' | 'ipv4' | 'ipv6' | 'opaque' | 'none';

export interface QueryParam {
  index: number;
  name: string;
  /** `null` = param without `=`; empty string = `x=`. */
  value: string | null;
  rawName: string;
  rawValue: string | null;
  encodingValid: boolean;
}

export interface ParsedUrl {
  /** Original input after trimming whitespace. */
  input: string;
  /** Normalised WHATWG serialisation. */
  href: string;
  /** `true` when `https://` was added because the input had no scheme. */
  schemeAssumed: boolean;
  /** Without `:`. */
  scheme: string;
  username: string;
  /** Empty when absent. The UI masks it by default. */
  password: string;
  host: { ascii: string; unicode: string; kind: HostKind };
  /** Per the Public Suffix List; `null` for IPs. */
  registrableDomain: string | null;
  subdomain: string | null;
  port: { value: number | null; isDefault: boolean };
  path: { raw: string; decoded: string; segments: string[] };
  /** In original order, repeated names included. */
  query: QueryParam[];
  fragment: string | null;
  warnings: MessageRef[];
}

export function toolError(code: CoreErrorCode, part?: string): ToolError {
  return { code, message: { code }, ...(part === undefined ? {} : { part }) };
}
