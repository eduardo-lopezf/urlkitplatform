/**
 * Limits of each API plan, shown on the API page (003/T042a). A copy of the public buckets of
 * apps/api/src/quota/plans.json, because the web may not import apps/api (plan.md, "Grafo de
 * dependencias"); tests/unit/api-limits.test.ts fails if they ever differ. `metrics` is left
 * out: it is internal to the web.
 */
export interface Windows {
  hour: number;
  day?: number;
}

export type PublicBucket =
  'local' | 'inspect' | 'headers' | 'metadata' | 'tls' | 'dns' | 'security';

export const API_LIMITS: Record<'anonymous' | 'organization', Record<PublicBucket, Windows>> = {
  anonymous: {
    local: { hour: 600 },
    inspect: { hour: 10, day: 50 },
    headers: { hour: 10, day: 50 },
    metadata: { hour: 10, day: 50 },
    tls: { hour: 10, day: 50 },
    dns: { hour: 10, day: 50 },
    security: { hour: 10, day: 50 },
  },
  organization: {
    local: { hour: 6000 },
    inspect: { hour: 100, day: 1000 },
    headers: { hour: 100, day: 1000 },
    metadata: { hour: 100, day: 1000 },
    tls: { hour: 100, day: 1000 },
    dns: { hour: 100, day: 1000 },
    security: { hour: 100, day: 1000 },
  },
};

/** The rows of the limits table, in the order of the tools. */
export const LIMIT_ROWS: Array<{ bucket: PublicBucket; tools: string }> = [
  { bucket: 'local', tools: 'Smart Cleaner, URL Parser, URL Diff, Explain URL' },
  { bucket: 'inspect', tools: 'Redirect Inspector' },
  { bucket: 'headers', tools: 'HTTP Headers' },
  { bucket: 'metadata', tools: 'Metadata' },
  { bucket: 'tls', tools: 'TLS' },
  { bucket: 'dns', tools: 'DNS' },
  { bucket: 'security', tools: 'Security Analysis' },
];
