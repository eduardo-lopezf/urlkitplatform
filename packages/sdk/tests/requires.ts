/**
 * Suites that need a real service (PostgreSQL, Valkey, pg_dump) are skipped on a machine without
 * it, but never in CI: GitHub Actions sets CI=true, and there a missing service would turn a
 * whole suite into a silent skip while the run stays green. In CI it fails instead.
 */
export function skipUnless(available: boolean, what: string): boolean {
  if (!available && process.env.CI)
    throw new Error(`${what} is required in CI: without it this suite would be skipped silently.`);
  return !available;
}
