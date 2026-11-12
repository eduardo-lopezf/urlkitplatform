/** POST /v1/tls (002/T059), as in specs/002-v2-network-analysis/contracts/openapi.yaml. */
import { CatalogVersionSchema, MessageRefSchema, z } from './common.ts';

export const CertificateSchema = z
  .object({
    subject: z.string(),
    issuer: z.string(),
    subjectAltNames: z.array(z.string()),
    serialNumber: z.string(),
    validFrom: z.string(),
    validTo: z.string(),
    daysRemaining: z.number().int().openapi({ description: 'Negativo si ya caducó' }),
    signatureAlgorithm: z.string(),
    fingerprint256: z.string(),
    isCa: z.boolean(),
  })
  .openapi('Certificate');

export const TlsAnalysisSchema = z
  .object({
    input: z.string(),
    host: z.union([
      z.object({ unicode: z.string(), ascii: z.string() }),
      z.object({ ip: z.string() }),
    ]),
    port: z.number().int(),
    blocked: MessageRefSchema.optional().openapi({
      description: 'Código inspect.blocked.* con el mismo significado publicado en la v1.',
    }),
    protocol: z.string().nullable(),
    cipher: z.string().nullable(),
    alpn: z.string().nullable(),
    sniSent: z.boolean(),
    trust: z.enum(['trusted', 'untrusted']).optional(),
    chain: z.array(CertificateSchema),
    problems: z.array(MessageRefSchema),
    transparency: z.object({
      status: z.enum(['embedded', 'absent', 'unknown']),
      count: z.number().int().min(0),
    }),
    error: MessageRefSchema.optional(),
    catalogVersion: CatalogVersionSchema,
  })
  .openapi('TlsAnalysis');

export const TlsRequest = z.object({
  target: z
    .string()
    .min(1)
    .max(32_000)
    .openapi({ description: 'URL `https` o nombre de host (con puerto opcional).' }),
});
