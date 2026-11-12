/** POST /v1/dns (002/T071), as in specs/002-v2-network-analysis/contracts/openapi.yaml. */
import { MessageRefSchema, z } from './common.ts';

export const DnsNameSchema = z
  .object({ unicode: z.string(), ascii: z.string() })
  .openapi('DnsName');

export const DnsRecordSetSchema = z
  .object({
    state: z.enum(['ok', 'empty', 'failed']),
    records: z.array(
      z.object({
        name: z.string(),
        ttl: z.number().int().min(0),
        data: z
          .union([z.string(), z.record(z.string(), z.union([z.string(), z.number()]))])
          .openapi({
            description: 'Cadena (A, AAAA, CNAME, NS, TXT) u objeto estructurado (MX, CAA, SOA).',
          }),
      }),
    ),
  })
  .openapi('DnsRecordSet');

export const DnsLookupSchema = z
  .object({
    input: z.string(),
    name: DnsNameSchema,
    alternative: z
      .object({ unicode: z.string(), ascii: z.string(), kind: z.enum(['host', 'registrable']) })
      .nullable(),
    outcome: z.enum(['exists', 'nxdomain', 'failed']),
    dnssec: z.enum(['validated', 'unsigned', 'bogus', 'unknown']),
    resolver: z.enum(['cloudflare', 'quad9']),
    records: z.object({
      A: DnsRecordSetSchema,
      AAAA: DnsRecordSetSchema,
      CNAME: DnsRecordSetSchema,
      MX: DnsRecordSetSchema,
      NS: DnsRecordSetSchema,
      TXT: DnsRecordSetSchema,
      CAA: DnsRecordSetSchema,
      SOA: DnsRecordSetSchema,
    }),
    warnings: z.array(MessageRefSchema),
  })
  .openapi('DnsLookup');

export const DnsRequest = z.object({
  target: z.string().min(1).max(32_000).openapi({ description: 'URL o nombre' }),
  scope: z.enum(['host', 'registrable']).default('host'),
});
