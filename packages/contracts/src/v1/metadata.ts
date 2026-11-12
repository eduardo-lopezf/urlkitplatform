/** POST /v1/metadata (002/T045), as in specs/002-v2-network-analysis/contracts/openapi.yaml. */
import {
  CatalogVersionSchema,
  MessageRefSchema,
  StopReasonSchema,
  UrlInputSchema,
  z,
} from './common.ts';

export const EffectiveValueSchema = z
  .object({
    value: z.string(),
    from: z.enum(['openGraph', 'twitter', 'basic']),
  })
  .openapi('EffectiveValue');

export const PageMetadataSchema = z
  .object({
    input: z.string(),
    finalUrl: z.string().nullable(),
    hops: z.number().int().min(0),
    stopReason: StopReasonSchema,
    contentType: z.string().nullable(),
    encoding: z
      .object({
        label: z.string(),
        source: z.enum(['bom', 'header', 'meta', 'default']),
        warning: MessageRefSchema.optional(),
      })
      .optional(),
    truncated: z.boolean(),
    sources: z.object({
      basic: z.record(z.string(), z.string()),
      openGraph: z.record(z.string(), z.array(z.string())),
      twitter: z.record(z.string(), z.array(z.string())),
      links: z.object({
        canonical: z.string().optional(),
        icon: z.array(z.string()).optional(),
        alternate: z.array(z.object({ hreflang: z.string(), href: z.string() })).optional(),
      }),
      lang: z.string().optional(),
    }),
    effective: z
      .object({
        title: EffectiveValueSchema.optional(),
        description: EffectiveValueSchema.optional(),
        image: EffectiveValueSchema.optional(),
        url: EffectiveValueSchema.optional(),
        siteName: EffectiveValueSchema.optional(),
        type: EffectiveValueSchema.optional(),
      })
      .openapi({
        description:
          'Valor que mostraría una vista previa. Las URL son texto: el cliente no debe cargarlas.',
      }),
    warnings: z.array(MessageRefSchema),
    error: MessageRefSchema.optional(),
    catalogVersion: CatalogVersionSchema,
  })
  .openapi('PageMetadata');

export const MetadataRequest = z.object({ url: UrlInputSchema });
