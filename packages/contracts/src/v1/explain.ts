import { CatalogVersionSchema, MessageRefSchema, UrlInputSchema, z } from './common.ts';
import { ParsedUrlSchema } from './parse.ts';

export const SIGNAL_IDS = [
  'userinfo-deception',
  'ip-host',
  'homograph',
  'mixed-scripts',
  'excessive-encoding',
  'double-encoding',
  'dangerous-scheme',
  'unusual-port',
  'nested-url',
  'abuse-tld',
] as const;

export const SignalSchema = z
  .object({
    id: z.enum(SIGNAL_IDS),
    severity: z.enum(['info', 'caution']),
    message: MessageRefSchema,
    evidence: z.string(),
  })
  .openapi('Signal');

export const ExplanationSchema = z
  .object({
    catalogVersion: CatalogVersionSchema,
    url: ParsedUrlSchema,
    parts: z.array(
      z.object({
        component: z.string(),
        value: z.string(),
        message: MessageRefSchema,
        platform: z.string().optional(),
      }),
    ),
    signals: z.array(SignalSchema),
  })
  .openapi('Explanation');

export const ExplainRequest = z.object({ url: UrlInputSchema });
