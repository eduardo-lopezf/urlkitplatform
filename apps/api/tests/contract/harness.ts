/**
 * Validates any API response against the designed contract,
 * specs/001-mvp-url-toolkit/contracts/openapi.yaml (T042). Provider side of Principio IX.
 */
import { readFileSync } from 'node:fs';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import { expect } from 'vitest';
import { parse } from 'yaml';

const SPEC = new URL(
  '../../../../specs/001-mvp-url-toolkit/contracts/openapi.yaml',
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
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ ...doc, $id: 'openapi' } as object);

const cache = new Map<string, ValidateFunction | null>();
const escape = (segment: string) => segment.replace(/~/g, '~0').replace(/\//g, '~1');

/** JSON-body validator for an operation and status, or `null` when the response has no body. */
function validatorFor(method: string, path: string, status: number): ValidateFunction | null {
  const key = `${method} ${path} ${status}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const response = doc.paths[path]?.[method]?.responses[String(status)];
  if (!response)
    throw new Error(`The contract does not allow ${status} for ${method.toUpperCase()} ${path}`);
  const target = response.$ref
    ? doc.components.responses[response.$ref.split('/').pop() ?? '']
    : response;
  const base = response.$ref
    ? `openapi${response.$ref}`
    : `openapi#/paths/${escape(path)}/${method}/responses/${status}`;
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
