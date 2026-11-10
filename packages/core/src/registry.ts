/**
 * Common registry every tool registers with (Principio I; contracts/tool-registry.md).
 * Adding a tool never modifies the existing ones.
 */
import type { RuleCatalog } from './tools/clean/catalog.ts';
import type { FetchHop } from './tools/inspect/types.ts';
import type { Result } from './types.ts';

export type ToolId = 'clean' | 'parse' | 'inspect' | 'diff' | 'explain';

export const TOOL_IDS: readonly ToolId[] = ['clean', 'parse', 'inspect', 'diff', 'explain'];

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
