/**
 * localStorage that never throws: blocked storage, private mode or quota errors simply mean the
 * preference is not remembered (web-routes.md).
 */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered; the tool works the same.
  }
}
