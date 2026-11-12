/**
 * Common registry every tool registers with (Principio I; contracts/tool-registry.md).
 * Adding a tool never modifies the existing ones.
 */
import type { RuleCatalog } from './tools/clean/catalog.ts';
import type { QueryDns } from './tools/dns/types.ts';
import type { FetchChain } from './tools/headers/types.ts';
import type { ParseHtml } from './tools/metadata/types.ts';
import type { FetchHop } from './tools/inspect/types.ts';
import type { ProbeTls } from './tools/tls/types.ts';
import type { Result } from './types.ts';

export type ToolId =
  | 'clean'
  | 'parse'
  | 'inspect'
  | 'diff'
  | 'explain'
  // v2: network tools, all `runsOn: 'server'` (002 contracts/tool-registry.md)
  | 'headers'
  | 'metadata'
  | 'tls'
  | 'dns'
  | 'security';

export const TOOL_IDS: readonly ToolId[] = [
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
];

/**
 * Minimal structural schema. Zod schemas satisfy it, but the core does not depend on Zod: the
 * wire contract lives in packages/contracts and the core stays dependency-free (T005).
 */
export interface Schema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
}

export interface ToolContext {
  /** Rules catalog, injected by the adapter (the core never imports packages/rules). */
  catalog?: RuleCatalog;
  /** Network adapter for `inspect`; the core knows nothing about the network. */
  fetchHop?: FetchHop;
  /** v2 network adapters (002 research R2). They observe; the core interprets. */
  fetchChain?: FetchChain;
  probeTls?: ProbeTls;
  queryDns?: QueryDns;
  /** HTML parser of Metadata, injected from `@urlkit/core/html` so the web never bundles it. */
  parseHtml?: ParseHtml;
}

export interface ToolDefinition<I = unknown, O = unknown> {
  id: ToolId;
  /** Semantic version of the tool. */
  version: string;
  /** `server` only for inspect in the MVP. */
  runsOn: 'client' | 'server';
  input: Schema<I>;
  output: Schema<O>;
  /** Deterministic for `client` tools; never throws on user input, returns a ToolError. */
  run(input: I, ctx: ToolContext): Result<O> | Promise<Result<O>>;
  /** Targets of "Enviar a" (FR-004). */
  sendTo: ToolId[];
  /** Shareable links: the input travels in the URL fragment only (FR-005). */
  share: { encode(input: I): string; decode(fragment: string): I | null };
}

export interface Registry {
  registerTool(def: ToolDefinition): void;
  getTool(id: ToolId): ToolDefinition;
  listTools(): ToolDefinition[];
}

export function createRegistry(): Registry {
  const tools = new Map<ToolId, ToolDefinition>();
  return {
    registerTool(def) {
      if (tools.has(def.id)) throw new Error(`Tool "${def.id}" is already registered`);
      tools.set(def.id, def);
    },
    getTool(id) {
      const def = tools.get(id);
      if (!def) throw new Error(`Tool "${id}" is not registered`);
      return def;
    },
    listTools() {
      return [...tools.values()];
    },
  };
}
