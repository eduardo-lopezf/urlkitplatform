/**
 * Validates any API response against the designed contract,
 * specs/001-mvp-url-toolkit/contracts/openapi.yaml (T042), and the v2 additions in
 * specs/002-v2-network-analysis/contracts/openapi.yaml, which reference the 001 components.
 * Provider side of Principio IX.
 */
import { readFileSync } from 'node:fs';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import { expect } from 'vitest';
import { parse } from 'yaml';

const SPEC = new URL(
  '../../../../specs/001-mvp-url-toolkit/contracts/openapi.yaml',
  import.meta.url,
);
const SPEC_V2 = new URL(
  '../../../../specs/002-v2-network-analysis/contracts/openapi.yaml',
  import.meta.url,
);

interface Response_ {
  $ref?: string;
  content?: Record<string, { schema: object }>;
}
interface Doc {
  paths: Record<string, Record<string, { responses: Record<string, Response_> }>>;
  components: { responses: Record<string, Response_> };
}

const doc = parse(readFileSync(SPEC, 'utf8')) as Doc;
const docV2 = parse(readFileSync(SPEC_V2, 'utf8')) as Doc;
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ ...doc, $id: 'openapi' } as object);
// The v2 file uses relative $refs to the 001 file: both are registered under their file URLs.
ajv.addSchema({ ...doc, $id: SPEC.href } as object);
ajv.addSchema({ ...docV2, $id: SPEC_V2.href } as object);

const cache = new Map<string, ValidateFunction | null>();
const escape = (segment: string) => segment.replace(/~/g, '~0').replace(/\//g, '~1');

/** JSON-body validator for an operation and status, or `null` when the response has no body. */
function validatorFor(method: string, path: string, status: number): ValidateFunction | null {
  const key = `${method} ${path} ${status}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const inV2 = doc.paths[path] === undefined && docV2.paths[path] !== undefined;
  const source = inV2 ? docV2 : doc;
  const id = inV2 ? SPEC_V2.href : 'openapi';
  const response = source.paths[path]?.[method]?.responses[String(status)];
  if (!response)
    throw new Error(`The contract does not allow ${status} for ${method.toUpperCase()} ${path}`);
  // A v2 response may point at a 001 component ("../../001-…/openapi.yaml#/components/…").
  const [refFile, refPointer] = (response.$ref ?? '').split('#');
  const refDoc = refFile ? doc : source;
  const refId = refFile ? new URL(refFile, SPEC_V2).href : id;
  const target = response.$ref
    ? refDoc.components.responses[refPointer?.split('/').pop() ?? '']
    : response;
  const base = response.$ref
    ? `${refId}#${refPointer}`
    : `${id}#/paths/${escape(path)}/${method}/responses/${status}`;
  const validate = target?.content?.['application/json']
    ? ajv.compile({ $ref: `${base}/content/application~1json/schema` })
    : null;
  cache.set(key, validate);
  return validate;
}

/** Asserts that a response matches the contract for its operation and status; returns the body. */
export async function expectContract(
  res: Response,
  method: 'get' | 'post',
  path: string,
): Promise<unknown> {
  const validate = validatorFor(method, path, res.status);
  const text = await res.text();
  const body: unknown = text === '' ? undefined : JSON.parse(text);
  if (validate) {
    expect(
      validate(body),
      `${method.toUpperCase()} ${path} ${res.status}: ${ajv.errorsText(validate.errors)}`,
    ).toBe(true);
  } else {
    expect(text, `${method.toUpperCase()} ${path} ${res.status} must have no body`).toBe('');
  }
  return body;
}
