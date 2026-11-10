import { CatalogVersionSchema, UrlInputSchema, z } from './common.ts';

export const DifferenceSchema = z
  .object({
    component: z.enum(['scheme', 'userinfo', 'host', 'port', 'path', 'query', 'fragment']),
    param: z.string().optional(),
    change: z.enum(['added', 'removed', 'modified']),
    before: z.string().optional(),
    after: z.string().optional(),
  })
  .openapi('Difference');

const DiffOptions = z.object({
  ignoreParamOrder: z.boolean().optional().default(true),
  ignoreTracking: z.boolean().optional().default(false),
  normalize: z.boolean().optional().default(true),
});

export const UrlComparisonSchema = z
  .object({
    catalogVersion: CatalogVersionSchema.optional().openapi({
      description: 'Presente solo si se aplicó `ignoreTracking`, que usa el catálogo.',
    }),
    a: z.string(),
    b: z.string(),
    options: z.object({
      ignoreParamOrder: z.boolean().optional(),
      ignoreTracking: z.boolean().optional(),
      normalize: z.boolean().optional(),
    }),
    equivalent: z.boolean(),
    differences: z.array(DifferenceSchema),
    cosmetic: z.array(DifferenceSchema),
  })
  .openapi('UrlComparison');

export const DiffRequest = z.object({
  a: UrlInputSchema,
  b: UrlInputSchema,
  options: DiffOptions.optional().default({
    ignoreParamOrder: true,
    ignoreTracking: false,
    normalize: true,
  }),
});
