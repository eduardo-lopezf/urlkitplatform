/** POST /v1/headers (002/T032), as in specs/002-v2-network-analysis/contracts/openapi.yaml. */
import {
  CatalogVersionSchema,
  MessageRefSchema,
  StopReasonSchema,
  UrlInputSchema,
  z,
} from './common.ts';

export const HeaderCheckSchema = z.object({
  header: z.string(),
  state: z.enum(['present', 'missing', 'misconfigured', 'not-applicable']),
  findings: z.array(MessageRefSchema),
});

export const CookieCheckSchema = z
  .object({
    name: z.string(),
    secure: z.boolean(),
    httpOnly: z.boolean(),
    sameSite: z.enum(['strict', 'lax', 'none']).nullable(),
    findings: z.array(MessageRefSchema),
  })
  .openapi({ description: 'Atributos de una cookie. Su valor nunca se devuelve.' });

export const HeadersAnalysisSchema = z
  .object({
    input: z.string(),
    finalUrl: z.string().nullable(),
    hops: z.number().int().min(0),
    stopReason: StopReasonSchema,
    status: z.number().int().nullable(),
    headers: z.array(z.object({ name: z.string(), value: z.string() })).openapi({
      description:
        'En el orden recibido; repeticiones por separado. Set-Cookie con valor "<omitido>".',
    }),
    security: z.array(HeaderCheckSchema),
    cookies: z.array(CookieCheckSchema),
    error: MessageRefSchema.optional(),
    catalogVersion: CatalogVersionSchema,
  })
  .openapi('HeadersAnalysis');

export const HeadersRequest = z.object({ url: UrlInputSchema });
