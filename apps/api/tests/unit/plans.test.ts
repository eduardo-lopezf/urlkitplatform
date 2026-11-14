/** Plans as versioned data (003/T028, research R4, FR-020, FR-021, FR-025). */
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import plansFile from '../../src/quota/plans.json' with { type: 'json' };
import schema from '../../src/quota/plans.schema.json' with { type: 'json' };
import { createLogger } from '../../src/privacy/logger.ts';
import { ANONYMOUS_PLAN, PLAN_IDS, planFor } from '../../src/quota/plans.ts';
import type { QuotaBucket } from '../../src/quota/types.ts';

const BUCKETS: QuotaBucket[] = [
  'inspect',
  'local',
  'metrics',
  'headers',
  'metadata',
  'tls',
  'dns',
  'security',
];
const ORG = { type: 'organization', organizationId: 'o1' } as const;
const ANON = { type: 'anon-ip', hash: 'h' } as const;

describe('plans (003)', () => {
  it('plans.json validates against its schema (FR-021)', () => {
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    expect(validate(plansFile), JSON.stringify(validate.errors)).toBe(true);
    expect(PLAN_IDS).toEqual(['anonymous', 'organization']);
  });

  it('keeps the anonymous plan exactly as before', () => {
    expect(planFor(ANON)).toEqual(ANONYMOUS_PLAN);
    expect(ANONYMOUS_PLAN.limits).toEqual({
      inspect: { hour: 10, day: 50 },
      local: { hour: 600 },
      metrics: { hour: 300 },
      headers: { hour: 10, day: 50 },
      metadata: { hour: 10, day: 50 },
      tls: { hour: 10, day: 50 },
      dns: { hour: 10, day: 50 },
      security: { hour: 10, day: 50 },
    });
  });

  it('gives an organization its plan, with the limits of research R4 (FR-020)', () => {
    const plan = planFor(ORG, 'organization');
    expect(plan.id).toBe('organization');
    for (const bucket of ['inspect', 'headers', 'metadata', 'tls', 'dns', 'security'] as const)
      expect(plan.limits[bucket]).toEqual({ hour: 100, day: 1000 });
    expect(plan.limits.local).toEqual({ hour: 6000 });
  });

  it('falls back to anonymous for a missing bucket; no plan is unlimited (FR-025)', () => {
    const plan = planFor(ORG, 'organization');
    expect(plan.limits.metrics).toEqual(ANONYMOUS_PLAN.limits.metrics);
    for (const id of PLAN_IDS)
      for (const bucket of BUCKETS)
        expect(
          Object.keys(planFor(ORG, id).limits[bucket]).length,
          `${id} ${bucket}`,
        ).toBeGreaterThan(0);
  });

  it('applies anonymous limits to an unknown plan id and warns', () => {
    const lines: string[] = [];
    const plan = planFor(
      ORG,
      'gold',
      createLogger((line) => lines.push(line)),
    );
    expect(plan.limits).toEqual(ANONYMOUS_PLAN.limits);
    expect(lines.join('\n')).toContain('plan.unknown');
  });
});
