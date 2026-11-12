import { MessageRefSchema, StopReasonSchema, UrlInputSchema, z } from './common.ts';

export const HopSchema = z
  .object({
    index: z.number().int(),
    url: z.string(),
    status: z.number().int().nullable(),
    type: z.enum(['permanent', 'temporary', 'meta-refresh', 'javascript', 'interstitial', 'final']),
    location: z.string().nullable().optional(),
    durationMs: z.number().int(),
    flags: z.array(z.enum(['https-downgrade', 'domain-change'])),
    error: MessageRefSchema.optional(),
  })
  .openapi('Hop');

export const RedirectChainSchema = z
  .object({
    input: z.string(),
    hops: z.array(HopSchema).max(21),
    final: z.string().nullable(),
    stopReason: StopReasonSchema,
    totalMs: z.number().int(),
  })
  .openapi('RedirectChain');

export const InspectRequest = z.object({ url: UrlInputSchema });
