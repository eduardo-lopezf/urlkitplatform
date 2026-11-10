/** Percent-encoding helpers that never throw on malformed input. */

const RUN = /(?:%[0-9A-Fa-f]{2})+/g;
const STRAY_PERCENT = /%(?![0-9A-Fa-f]{2})/;

/** Decodes valid UTF-8 percent-encoded runs and leaves invalid ones untouched. */
export function percentDecode(value: string): string {
  return value.replace(RUN, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
}

/** application/x-www-form-urlencoded decoding: `+` is a space. Used for query names and values. */
export function formDecode(value: string): string {
  return percentDecode(value.replace(/\+/g, ' '));
}

export function isValidEncoding(value: string): boolean {
  if (STRAY_PERCENT.test(value)) return false;
  for (const run of value.match(RUN) ?? []) {
    try {
      decodeURIComponent(run);
    } catch {
      return false;
    }
  }
  return true;
}

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;

/**
 * Canonical percent-encoding for comparisons: decodes triplets of unreserved characters and
 * upper-cases the hex digits of the rest (RFC 3986 §6.2.2). Equivalent encodings compare equal.
 */
export function normalizePercentEncoding(value: string): string {
  return value.replace(/%([0-9A-Fa-f]{2})/g, (triplet, hex: string) => {
    const char = String.fromCharCode(parseInt(hex, 16));
    return UNRESERVED.test(char) ? char : `%${hex.toUpperCase()}`;
  });
}
