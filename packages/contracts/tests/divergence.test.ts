import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { buildOpenApiDocument, InspectRequest, RedirectChainSchema } from '../src/index.ts';

type Schema = { properties?: Record<string, unknown>; required?: string[]; $ref?: string };
interface Doc {
  paths: Record<
    string,
    Record<
      string,
      {
        requestBody?: { content: Record<string, { schema: Schema }> };
        responses: Record<string, unknown>;
      }
    >
  >;
  components: { schemas: Record<string, Schema> };
}

const generated = JSON.parse(
  readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'),
) as Doc;
const designed = parseYaml(
  readFileSync(
    new URL('../../../specs/001-mvp-url-toolkit/contracts/openapi.yaml', import.meta.url),
    'utf8',
  ),
) as Doc;

/**
 * v2 additions (specs/002-v2-network-analysis/contracts/openapi.yaml). The v2 tools land one by
 * one (002 plan.md, "Delivery Order"), so only the operations already generated are compared,
 * with the v2 component schemas they publish.
 */
const designedV2 = parseYaml(
  readFileSync(
    new URL('../../../specs/002-v2-network-analysis/contracts/openapi.yaml', import.meta.url),
    'utf8',
  ),
) as Doc;
const v2Bodies = (designedV2 as { components: { requestBodies?: Record<string, unknown> } })
  .components.requestBodies;
for (const [path, methods] of Object.entries(designedV2.paths)) {
  if (!(path in generated.paths)) continue;
  for (const op of Object.values(methods)) {
    const ref = (op.requestBody as { $ref?: string } | undefined)?.$ref;
    const body = ref ? v2Bodies?.[ref.split('/').pop() ?? ''] : undefined;
    if (body) op.requestBody = body as NonNullable<typeof op.requestBody>;
  }
  designed.paths[path] = methods;
}
for (const [name, schema] of Object.entries(designedV2.components.schemas))
  if (!(name in designed.components.schemas) && name in generated.components.schemas)
    designed.components.schemas[name] = schema;

/** Schemas that only exist in the generated document because they are derived from code. */
const GENERATED_ONLY = new Set(['MessageCode', 'ErrorCode']);

function resolve(doc: Doc, schema: Schema): Schema {
  return schema.$ref
    ? (doc.components.schemas[schema.$ref.split('/').pop() ?? ''] ?? schema)
    : schema;
}

describe('published contract', () => {
  it('is up to date with the Zod schemas (run "pnpm build:contracts")', () => {
    expect(JSON.parse(JSON.stringify(buildOpenApiDocument()))).toEqual(generated);
  });

  it('has the same operations and response codes as the designed contract', () => {
    const ops = (doc: Doc) =>
      Object.entries(doc.paths).flatMap(([path, methods]) =>
        Object.entries(methods).map(
          ([method, op]) => `${method} ${path} ${Object.keys(op.responses).sort().join(',')}`,
        ),
      );
    expect(ops(generated).sort()).toEqual(ops(designed).sort());
    for (const path of Object.keys(generated.paths).filter((p) => !(p in designed.paths)))
      throw new Error(`${path} is generated but designed in neither contract`);
  });

  it('has the same request bodies as the designed contract', () => {
    for (const [path, methods] of Object.entries(designed.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        const want = op.requestBody?.content['application/json']?.schema;
        const got =
          generated.paths[path]?.[method]?.requestBody?.content['application/json']?.schema;
        if (!want) continue;
        const a = resolve(designed, want);
        const b = resolve(generated, got ?? {});
        expect(Object.keys(b.properties ?? {}).sort(), `${method} ${path}`).toEqual(
          Object.keys(a.properties ?? {}).sort(),
        );
        expect([...(b.required ?? [])].sort(), `${method} ${path}`).toEqual(
          [...(a.required ?? [])].sort(),
        );
      }
    }
  });

  it('has the same component schemas, properties and required fields', () => {
    const names = Object.keys(generated.components.schemas).filter((n) => !GENERATED_ONLY.has(n));
    expect(names.sort()).toEqual(Object.keys(designed.components.schemas).sort());
    for (const name of names) {
      const a = designed.components.schemas[name] ?? {};
      const b = generated.components.schemas[name] ?? {};
      expect(Object.keys(b.properties ?? {}).sort(), name).toEqual(
        Object.keys(a.properties ?? {}).sort(),
      );
      expect([...(b.required ?? [])].sort(), name).toEqual([...(a.required ?? [])].sort());
    }
  });
});

describe('consumer side: the web inspect client typed from the contract', () => {
  it('builds requests and accepts responses the published schema allows', () => {
    expect(InspectRequest.safeParse({ url: 'https://bit.example/x' }).success).toBe(true);
    expect(InspectRequest.safeParse({ url: '' }).success).toBe(false);
    const chain = {
      input: 'https://bit.example/x',
      hops: [
        {
          index: 0,
          url: 'https://bit.example/x',
          status: 301,
          type: 'permanent',
          location: 'https://ejemplo.com/',
          durationMs: 12,
          flags: ['domain-change'],
        },
        {
          index: 1,
          url: 'https://ejemplo.com/',
          status: 200,
          type: 'final',
          location: null,
          durationMs: 30,
          flags: [],
        },
      ],
      final: 'https://ejemplo.com/',
      stopReason: 'final',
      totalMs: 42,
    };
    expect(RedirectChainSchema.safeParse(chain).success).toBe(true);
    expect(RedirectChainSchema.safeParse({ ...chain, stopReason: 'unknown' }).success).toBe(false);
  });
});
