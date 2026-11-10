import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { CLEAN_REASON_CODES } from '@urlkit/core';
import schema from '../schema/rule.schema.json' with { type: 'json' };
import { loadRuleFiles } from '../build/compile.ts';

const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(schema);

const base = {
  id: 'test.rule',
  kind: 'tracking-param',
  mode: 'safe',
  scope: 'global',
  match: { names: ['x'] },
  exceptions: { domains: [] },
  platform: 'Test',
  reason: 'clean.reason.campaign',
};

describe('rule schema', () => {
  it('accepts a valid tracking-param rule', () => {
    expect(validate(base), JSON.stringify(validate.errors)).toBe(true);
  });

  it('only accepts the three kinds', () => {
    for (const kind of ['tracking-param', 'wrapper', 'domain-rule']) {
      expect((schema.properties.kind as { enum: string[] }).enum).toContain(kind);
    }
    expect(validate({ ...base, kind: 'cookie' })).toBe(false);
  });

  it('requires domain-rule to be mode max', () => {
    const rule = {
      ...base,
      kind: 'domain-rule',
      scope: { domains: ['amazon.es'] },
      match: { pathPattern: '^/dp/(\\w+)', canonicalPath: '/dp/$1', query: 'drop' },
    };
    expect(validate({ ...rule, mode: 'max' }), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...rule, mode: 'safe' })).toBe(false);
  });

  it('only accepts reason codes owned by the core', () => {
    expect([...(schema.$defs.reason.enum as string[])].sort()).toEqual(
      [...CLEAN_REASON_CODES].sort(),
    );
    expect(validate({ ...base, reason: 'clean.reason.unknown' })).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(validate({ ...base, extra: true })).toBe(false);
  });

  it('validates every rule in the catalog and keeps ids unique', () => {
    const rules = loadRuleFiles();
    expect(rules.length).toBeGreaterThan(20);
    for (const { file, rule } of rules)
      expect(validate(rule), `${file}: ${JSON.stringify(validate.errors)}`).toBe(true);
    const ids = rules.map(({ rule }) => (rule as { id: string }).id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
