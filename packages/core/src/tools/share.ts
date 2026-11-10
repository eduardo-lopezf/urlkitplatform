/** Shareable fragments (`#u=…&m=…`). Values are encoded with encodeURIComponent (web-routes.md). */
export function encodeFragment(entries: Array<[string, string | undefined]>): string {
  return entries
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}

export function decodeFragment(fragment: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const piece of fragment.replace(/^#/, '').split('&')) {
    const eq = piece.indexOf('=');
    if (eq <= 0) continue;
    try {
      out.set(piece.slice(0, eq), decodeURIComponent(piece.slice(eq + 1)));
    } catch {
      // A malformed value is ignored: the tool simply opens empty.
    }
  }
  return out;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
