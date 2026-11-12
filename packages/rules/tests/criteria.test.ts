/**
 * Versioned v2 criteria (002/T008, research R8): security headers, TLS thresholds, finding
 * severities and metadata precedence live in the catalog, validated by schema and versioned with
 * it.
 */
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { CODES } from '@urlkit/core';
import schema from '../schema/criteria.schema.json' with { type: 'json' };
import { catalog } from '../dist/compiled.ts';

const read = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(`../data/${path}`, import.meta.url), 'utf8'));

const FILES = {
  headers: 'security/headers.json',
  tls: 'security/tls.json',
  severities: 'security/severities.json',
  precedence: 'metadata/precedence.json',
} as const;

const ajv = new Ajv2020({ allErrors: true });
ajv.addSchema(schema);
const validator = (name: keyof typeof FILES) => {
  const v = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
  if (!v) throw new Error(`schema has no $defs/${name}`);
  return v;
};

describe('criteria files', () => {
  it.each(Object.entries(FILES))('%s validates against its schema', (name, file) => {
    const validate = validator(name as keyof typeof FILES);
    expect(validate(read(file)), JSON.stringify(validate.errors)).toBe(true);
  });

  it('rejects an unknown severity and an unknown key', () => {
    expect(
      validator('severities')({
        source: 's',
        reviewed: '2026-11-11',
        severities: { x: 'critical' },
      }),
    ).toBe(false);
    expect(validator('tls')({ ...(read(FILES.tls) as object), extra: true })).toBe(false);
  });

  it('only gives severities to codes the core emits', () => {
    const { severities } = read(FILES.severities) as { severities: Record<string, string> };
    const known = new Set<string>(CODES);
    expect(Object.keys(severities).filter((code) => !known.has(code))).toEqual([]);
  });
});

describe('compiled catalog', () => {
  it('is version 1.3.0 or later and exposes the v2 sections', () => {
    const [major, minor] = catalog.version.split('.').map(Number);
    expect(major === 1 ? (minor ?? 0) >= 3 : (major ?? 0) > 1).toBe(true);
    expect(catalog.security?.headers.hsts.minMaxAge).toBe(31_536_000);
    expect(catalog.security?.tls.expiringSoonDays).toBe(30);
    expect(catalog.security?.severities['explain.signal.userinfo-deception']).toBe('medium');
    expect(catalog.metadata?.precedence.title).toEqual(['openGraph', 'twitter', 'basic']);
  });

  it('keeps the source and review metadata out of the compiled data', () => {
    expect(catalog.security?.headers).not.toHaveProperty('source');
    expect(catalog.security?.tls).not.toHaveProperty('reviewed');
  });
});
