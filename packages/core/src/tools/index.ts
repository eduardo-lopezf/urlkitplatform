/**
 * The default registry with every built-in tool. Adding a tool means registering it here; the
 * existing ones are not touched (Principio I).
 */
import { createRegistry, type ToolDefinition } from '../registry.ts';
import { cleanTool } from './clean/index.ts';
import { parseTool } from './parse/index.ts';
import { inspectTool } from './inspect/index.ts';
import { diffTool } from './diff/index.ts';
import { explainTool } from './explain/index.ts';
import { headersTool } from './headers/index.ts';
import { metadataTool } from './metadata/index.ts';
import { tlsTool } from './tls/index.ts';
import { dnsTool } from './dns/index.ts';
import { securityTool } from './security/index.ts';

export const registry = createRegistry();
registry.registerTool(cleanTool as ToolDefinition);
registry.registerTool(parseTool as ToolDefinition);
registry.registerTool(inspectTool as ToolDefinition);
registry.registerTool(diffTool as ToolDefinition);
registry.registerTool(explainTool as ToolDefinition);
registry.registerTool(headersTool as ToolDefinition);
registry.registerTool(metadataTool as ToolDefinition);
registry.registerTool(tlsTool as ToolDefinition);
registry.registerTool(dnsTool as ToolDefinition);
registry.registerTool(securityTool as ToolDefinition);

export const getTool = registry.getTool;
export const listTools = registry.listTools;

export {
  cleanTool,
  parseTool,
  inspectTool,
  diffTool,
  explainTool,
  headersTool,
  metadataTool,
  tlsTool,
  dnsTool,
  securityTool,
};
