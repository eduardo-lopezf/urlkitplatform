import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Doc {
  security?: Array<Record<string, string[]>>;
  components: { securitySchemes?: Record<string, { type: string; scheme?: string }> };
  paths: Record<string, Record<string, { security?: Array<Record<string, string[]>> }>>;
}

const doc = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8')) as Doc;

describe('authentication is declared and optional (Principio IV)', () => {
  it('declares the apiKey bearer scheme', () => {
    expect(doc.components.securitySchemes?.apiKey).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('lets every endpoint answer without credentials', () => {
    const security = doc.security ?? [];
    expect(security).toContainEqual({});
    expect(security).toContainEqual({ apiKey: [] });
    for (const [path, ops] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        // An operation-level override must keep the anonymous option too.
        if (op.security) expect(op.security, `${method} ${path}`).toContainEqual({});
      }
    }
  });
});

describe('API key responses (003, contracts/api-auth.md)', () => {
  const tools = Object.entries(doc.paths).filter(([path]) => !/^\/(metrics|openapi)/.test(path));

  it('every tool endpoint declares 401 auth.invalid and 503 auth.unavailable', () => {
    expect(tools.length).toBe(10);
    for (const [path, ops] of tools) {
      const responses = (ops.post as unknown as { responses: Record<string, unknown> }).responses;
      expect(responses, path).toHaveProperty('401');
      expect(responses, path).toHaveProperty('503');
    }
  });

  it('declares auth.unavailable as a contract code, and auth.invalid as no longer reserved', () => {
    const text = JSON.stringify(doc);
    expect(text).toContain('auth.unavailable');
    expect(text).not.toMatch(/Reservada: no se emite en el MVP/);
  });
});
