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
