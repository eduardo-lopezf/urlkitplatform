/** The API page shows the limits the API applies (003/T042a). */
import { describe, expect, it } from 'vitest';
import plansFile from '../../../api/src/quota/plans.json' with { type: 'json' };
import { API_LIMITS, LIMIT_ROWS } from '../../src/lib/api-limits.ts';

const publicBuckets = (limits: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(limits).filter(([bucket]) => bucket !== 'metrics'));

describe('API_LIMITS', () => {
  it('matches the public buckets of plans.json', () => {
    expect(API_LIMITS.anonymous).toEqual(publicBuckets(plansFile.plans.anonymous));
    expect(API_LIMITS.organization).toEqual(publicBuckets(plansFile.plans.organization));
  });

  it('has one table row per bucket', () => {
    expect(LIMIT_ROWS.map((row) => row.bucket).sort()).toEqual(
      Object.keys(API_LIMITS.anonymous).sort(),
    );
  });
});
