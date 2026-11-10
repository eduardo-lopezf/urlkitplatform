import { CatalogVersionSchema, MessageRefSchema, UrlInputSchema, z } from './common.ts';

export const RemovedItemSchema = z
  .object({
    kind: z.enum(['param', 'wrapper', 'path']),
    name: z.string(),
    value: z.string().optional(),
    ruleId: z.string(),
    platform: z.string().optional(),
    reason: MessageRefSchema,
  })
  .openapi('RemovedItem');

export const CleanResultSchema = z
  .object({
    catalogVersion: CatalogVersionSchema,
    input: z.string(),
    output: z.string(),
    mode: z.enum(['safe', 'max']),
    changed: z.boolean(),
    removed: z.array(RemovedItemSchema),
    unwrapped: z.array(z.string()),
    maxPreview: z
      .object({ output: z.string(), extra: z.array(RemovedItemSchema) })
      .nullable()
      .optional(),
  })
  .openapi('CleanResult');

export const CleanRequest = z.object({
  url: UrlInputSchema,
  mode: z.enum(['safe', 'max']).optional().default('safe'),
  keep: z.array(z.string()).optional().default([]),
});
