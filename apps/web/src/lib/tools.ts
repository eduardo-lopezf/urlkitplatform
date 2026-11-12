/**
 * Tools the web publishes, by group (002/T024). A v2 tool joins `ANALYSIS_TOOLS` in the same
 * change that creates its page, so no link ever points to a page that does not exist.
 */
import type { ToolId } from '@urlkit/core';

export const MVP_TOOLS: readonly ToolId[] = ['clean', 'parse', 'inspect', 'diff', 'explain'];

/** "Análisis técnico": server-side tools added in v2. */
export const ANALYSIS_TOOLS: readonly ToolId[] = ['headers', 'metadata', 'tls', 'dns', 'security'];

export const PUBLISHED_TOOLS: readonly ToolId[] = [...MVP_TOOLS, ...ANALYSIS_TOOLS];
