import { ToolIdSchema, z } from './common.ts';

/** Anonymous usage event: no cookies, no identifiers, nothing but these two fields. */
export const MetricsEvent = z.strictObject({
  tool: ToolIdSchema,
  outcome: z.enum(['success', 'error', 'copied', 'sent-to']),
});
