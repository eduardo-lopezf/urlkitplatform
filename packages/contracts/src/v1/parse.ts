import { MessageRefSchema, UrlInputSchema, z } from './common.ts';

export const QueryParamSchema = z
  .object({
    index: z.number().int(),
    name: z.string(),
    value: z.string().nullable(),
    rawName: z.string(),
    rawValue: z.string().nullable(),
    encodingValid: z.boolean(),
  })
  .openapi('QueryParam');

export const ParsedUrlSchema = z
  .object({
    input: z.string(),
    href: z.string(),
    schemeAssumed: z.boolean().optional(),
    scheme: z.string(),
    username: z.string().optional(),
    password: z.string().optional(),
    host: z.object({
      ascii: z.string(),
      unicode: z.string(),
      kind: z.enum(['domain', 'ipv4', 'ipv6', 'opaque', 'none']),
    }),
    registrableDomain: z.string().nullable().optional(),
    subdomain: z.string().nullable().optional(),
    port: z.object({ value: z.number().int().nullable(), isDefault: z.boolean() }),
    path: z.object({ raw: z.string(), decoded: z.string(), segments: z.array(z.string()) }),
    query: z.array(QueryParamSchema),
    fragment: z.string().nullable().optional(),
    warnings: z.array(MessageRefSchema),
  })
  .openapi('ParsedUrl');

export const ParseRequest = z.object({ url: UrlInputSchema });
