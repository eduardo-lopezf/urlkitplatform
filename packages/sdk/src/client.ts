/**
 * The URLkit client (004, research R3). One method per tool operation of the contract, built from
 * the generated `TOOL_OPERATIONS`, so a tool added to the contract gets its method on the next
 * `generate`. Types come from the generated `operations`; nothing here restates the contract.
 *
 * The API key lives only in this closure: it is not a property of the client and never reaches an
 * error (FR-014). The client sends no request it was not asked for (FR-005).
 */
import { UrlkitApiError, UrlkitTransportError, type RateLimit } from './errors.ts';
import { DEFAULT_BASE_URL, TOOL_OPERATIONS, type operations } from './generated/openapi.ts';
import { withRetries, type RetryOptions } from './retry.ts';

export type ToolOperationId = keyof typeof TOOL_OPERATIONS;

type JsonBody<T> = T extends { content: { 'application/json': infer B } } ? B : never;
/** The request body of an operation. */
export type ToolRequest<Op extends ToolOperationId> = JsonBody<operations[Op]['requestBody']>;
/** The `200` response of an operation. */
export type ToolResult<Op extends ToolOperationId> = JsonBody<operations[Op]['responses'][200]>;
type Query<Op extends ToolOperationId> = NonNullable<operations[Op]['parameters']['query']>;
/** The `lang` values an operation accepts, or `never` when it takes no `?lang`. */
type Lang<Op extends ToolOperationId> = [Query<Op>] extends [never]
  ? never
  : Query<Op> extends { lang?: infer L }
    ? L
    : never;

/** `signal` always; `lang` only on the operations that declare it. */
export type CallOptions<Op extends ToolOperationId> = { signal?: AbortSignal } & ([
  Lang<Op>,
] extends [never]
  ? { lang?: never }
  : { lang?: Lang<Op> });

export interface ToolResponse<T> {
  data: T;
  rateLimit: RateLimit | null;
}

export type UrlkitClient = {
  [Op in ToolOperationId]: (
    body: ToolRequest<Op>,
    options?: CallOptions<Op>,
  ) => Promise<ToolResponse<ToolResult<Op>>>;
};

export interface ClientOptions {
  /** Organization API key, sent as `Authorization: Bearer`. Without it, calls are anonymous. */
  apiKey?: string;
  /** Base URL of /v1, without a trailing slash. Defaults to the production URL of the contract. */
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Off by default. When set, retries only on 429 and 503 (research R5). */
  retries?: RetryOptions;
}

/** The three RateLimit-* headers, or `null` when any is missing (FR-012). */
export function readRateLimit(headers: Headers): RateLimit | null {
  const values = ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'].map((name) =>
    headers.get(name),
  );
  if (values.some((v) => v === null || !/^\d+$/.test(v))) return null;
  const [limit, remaining, resetSeconds] = values.map(Number) as [number, number, number];
  return { limit, remaining, resetSeconds };
}

function retryAfter(body: { retryAfterSeconds?: unknown }, headers: Headers): number | undefined {
  if (typeof body.retryAfterSeconds === 'number') return body.retryAfterSeconds;
  const header = headers.get('Retry-After');
  return header !== null && /^\d+$/.test(header) ? Number(header) : undefined;
}

async function toError(response: Response): Promise<UrlkitApiError | UrlkitTransportError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new UrlkitTransportError('invalid-response', response.status);
  }
  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code !== 'string')
    return new UrlkitTransportError('invalid-response', response.status);
  return new UrlkitApiError({
    code,
    status: response.status,
    retryAfterSeconds: retryAfter(body as { retryAfterSeconds?: unknown }, response.headers),
    rateLimit: readRateLimit(response.headers),
  });
}

function transportFailure(error: unknown, signal?: AbortSignal): UrlkitTransportError {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'TimeoutError') return new UrlkitTransportError('timeout');
  if (name === 'AbortError' || signal?.aborted) return new UrlkitTransportError('aborted');
  return new UrlkitTransportError('network');
}

export function createClient(options: ClientOptions = {}): UrlkitClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const doFetch = options.fetch ?? globalThis.fetch;
  const { apiKey, retries } = options;

  async function once(
    op: ToolOperationId,
    body: unknown,
    call: { signal?: AbortSignal; lang?: string },
  ) {
    const { path, lang } = TOOL_OPERATIONS[op];
    const url = `${baseUrl}${path}${lang && call.lang ? `?lang=${encodeURIComponent(call.lang)}` : ''}`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (apiKey !== undefined) headers.authorization = `Bearer ${apiKey}`;
    let response: Response;
    try {
      response = await doFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        ...(call.signal ? { signal: call.signal } : {}),
      });
    } catch (error) {
      throw transportFailure(error, call.signal);
    }
    if (response.ok) {
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new UrlkitTransportError('invalid-response', response.status);
      }
      return { data, rateLimit: readRateLimit(response.headers) };
    }
    throw await toError(response);
  }

  const client: Record<string, unknown> = {};
  for (const op of Object.keys(TOOL_OPERATIONS) as ToolOperationId[])
    client[op] = (body: unknown, call: { signal?: AbortSignal; lang?: string } = {}) =>
      withRetries(() => once(op, body, call), retries, call.signal);
  return client as UrlkitClient;
}
