/** POST /v1/security (002/T085), as in specs/002-v2-network-analysis/contracts/openapi.yaml. */
import {
  CatalogVersionSchema,
  MessageCodeSchema,
  MessageRefSchema,
  SeveritySchema,
  UrlInputSchema,
  z,
} from './common.ts';

const TOOLS = ['explain', 'inspect', 'headers', 'tls', 'dns'] as const;

export const FindingSchema = z
  .object({
    code: MessageCodeSchema,
    severity: SeveritySchema,
    tool: z.enum(TOOLS),
    params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    text: z.string().optional().openapi({ description: 'Solo si se pidió lang' }),
  })
  .openapi('Finding');

export const PartStateSchema = z
  .object({
    state: z.enum(['complete', 'incomplete', 'skipped']),
    reason: MessageRefSchema.optional(),
  })
  .openapi('PartState');

export const SecurityReviewSchema = z
  .strictObject({
    input: z.string(),
    finalUrl: z.string().nullable(),
    findings: z.array(FindingSchema).openapi({
      description: 'Ordenados por gravedad (high → info) y, a igual gravedad, por herramienta.',
    }),
    parts: z.object({
      explain: PartStateSchema,
      redirects: PartStateSchema,
      headers: PartStateSchema,
      tls: PartStateSchema,
      dns: PartStateSchema,
    }),
    scope: z.object({
      checked: z.array(z.enum(TOOLS)),
      notChecked: z.array(z.enum(['reputation', 'content'])).min(1),
    }),
    catalogVersion: CatalogVersionSchema,
  })
  .openapi('SecurityReview', {
    description: 'Sin campo de nota, puntuación ni veredicto (FR-064).',
  });

export const SecurityRequest = z.object({ url: UrlInputSchema });
