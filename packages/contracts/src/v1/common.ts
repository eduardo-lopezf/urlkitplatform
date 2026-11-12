import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { MESSAGE_CODES, TOOL_ERROR_CODES } from '../errors.ts';

extendZodWithOpenApi(z);

export { z };

export const MessageCodeSchema = z.enum(MESSAGE_CODES).openapi('MessageCode', {
  description:
    'Stable message code. Part of the public contract: a published code never changes meaning or disappears without deprecation. New codes are added in minor versions: clients MUST accept values they do not know.',
});

export const ErrorCodeSchema = z.enum(TOOL_ERROR_CODES).openapi('ErrorCode');

export const ToolIdSchema = z
  .enum([
    'clean',
    'parse',
    'inspect',
    'diff',
    'explain',
    'headers',
    'metadata',
    'tls',
    'dns',
    'security',
  ])
  .openapi('ToolId', {
    description:
      'Tool identifier. New tools are added in minor versions: clients MUST accept values they do not know.',
  });

/** Severity of a Security Analysis finding (002 data-model.md). */
export const SeveritySchema = z.enum(['high', 'medium', 'low', 'info']).openapi('Severity');

/** Why a redirect chain stopped. Shared by inspect and the v2 tools that follow chains. */
export const StopReasonSchema = z.enum([
  'final',
  'loop',
  'max-hops',
  'blocked',
  'error',
  'timeout',
]);

export const UrlInputSchema = z.string().min(1).max(32_000).openapi('UrlInput');

export const MessageRefSchema = z
  .object({
    code: MessageCodeSchema,
    params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    text: z.string().optional().openapi({ description: 'Solo si se pidió lang' }),
  })
  .openapi('MessageRef');

export const ToolErrorSchema = z
  .object({
    code: ErrorCodeSchema,
    message: MessageRefSchema,
    part: z.string().optional(),
    retryAfterSeconds: z.number().int().optional(),
  })
  .openapi('ToolError');

export const CatalogVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/)
  .openapi('CatalogVersion', {
    description:
      'Versión del catálogo de reglas aplicada, en versionado semántico. Permite reproducir y auditar un resultado que depende del catálogo.',
    example: '1.4.0',
  });

export const LangQuerySchema = z.object({
  lang: z
    .enum(['es', 'en'])
    .optional()
    .openapi({ description: 'Si se indica, cada MessageRef incluye también el texto traducido.' }),
});
