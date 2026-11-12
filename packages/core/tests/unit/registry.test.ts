import { describe, expect, it } from 'vitest';
import { createRegistry, TOOL_IDS, type ToolDefinition } from '../../src/index.ts';

function tool(id: ToolDefinition['id']): ToolDefinition {
  return {
    id,
    version: '1.0.0',
    runsOn: 'client',
    input: { safeParse: (data: unknown) => ({ success: true, data }) },
    output: { safeParse: (data: unknown) => ({ success: true, data }) },
    run: (input: unknown) => ({ ok: true, value: input }),
    sendTo: [],
    share: { encode: () => '', decode: () => null },
  };
}

describe('tool registry', () => {
  it('registers and retrieves a tool by id', () => {
    const registry = createRegistry();
    const clean = tool('clean');
    registry.registerTool(clean);
    expect(registry.getTool('clean')).toBe(clean);
  });

  it('lists tools in registration order', () => {
    const registry = createRegistry();
    registry.registerTool(tool('parse'));
    registry.registerTool(tool('clean'));
    expect(registry.listTools().map((t) => t.id)).toEqual(['parse', 'clean']);
  });

  it('rejects a duplicate id', () => {
    const registry = createRegistry();
    registry.registerTool(tool('diff'));
    expect(() => registry.registerTool(tool('diff'))).toThrow(/diff/);
  });

  it('fails loudly for an unknown tool', () => {
    expect(() => createRegistry().getTool('explain')).toThrow(/explain/);
  });

  it('lists the v2 tool ids after the MVP ones (002/T006)', () => {
    expect(TOOL_IDS).toEqual([
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
    ]);
  });

  it('registers a v2 tool without altering the MVP definitions', () => {
    const registry = createRegistry();
    const clean = tool('clean');
    registry.registerTool(clean);
    registry.registerTool(tool('headers'));
    expect(registry.getTool('clean')).toBe(clean);
    expect(registry.listTools().map((t) => t.id)).toEqual(['clean', 'headers']);
  });

  it('keeps registries independent', () => {
    const a = createRegistry();
    a.registerTool(tool('clean'));
    expect(createRegistry().listTools()).toEqual([]);
  });
});
