/**
 * Structured logger that cannot leak URLs, queries or IPs (FR-005, Principio V).
 *
 * Fields are allow-listed: anything not in SAFE_FIELDS is dropped, whatever its name. Values of
 * allowed fields are still scanned and anything that looks like a URL or an IP is redacted, so a
 * mistake at a call site cannot put user input in the logs.
 */
const SAFE_FIELDS = new Set([
  'tool',
  'outcome',
  'status',
  'durationMs',
  'code',
  'stopReason',
  'hops',
  'route',
  'method',
  'window',
  'subjectType',
  /** Registrable domain at most (never path, query or fragment). */
  'domain',
  'port',
  'version',
]);

const URL_LIKE = /\b[a-z][a-z0-9+.-]*:\/\/\S*/gi;
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const IPV6 = /\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/gi;

export type LogFields = Record<string, unknown>;
export type Sink = (line: string) => void;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export function redact(value: string): string {
  return value.replace(URL_LIKE, '[url]').replace(IPV4, '[ip]').replace(IPV6, '[ip]');
}

function sanitize(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!SAFE_FIELDS.has(key)) continue;
    if (typeof value === 'string') out[key] = redact(value);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null)
      out[key] = value;
  }
  return out;
}

export function createLogger(sink: Sink = (line) => process.stdout.write(line + '\n')): Logger {
  const write = (level: string, event: string, fields: LogFields = {}) =>
    sink(JSON.stringify({ level, event: redact(event), ...sanitize(fields) }));
  return {
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}
