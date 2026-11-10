import { describe, expect, it } from 'vitest';
import { clean, parseUrl } from '@urlkit/core';
import { catalog } from '../dist/compiled.ts';
import { loadRuleFiles } from '../build/compile.ts';
import corpus from './corpus/urls.json' with { type: 'json' };

interface Case {
  id: string;
  url: string;
  mode: 'safe' | 'max';
  expected: string;
  trackingParams: string[];
}

const cases = corpus.cases as Case[];
const run = (c: Case) => {
  const result = clean({ url: c.url, mode: c.mode, catalog });
  if (!result.ok) throw new Error(`${c.id}: ${result.error.code}`);
  return result.value;
};

describe('SC-002 corpus', () => {
  it('has at least 200 cases with unique ids', () => {
    expect(cases.length).toBeGreaterThanOrEqual(200);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });

  it.each(cases.map((c) => [c.id, c] as const))('%s produces the expected clean URL', (_id, c) => {
    expect(run(c).output).toBe(c.expected);
  });

  it('removes at least 95 % of the tracking params', () => {
    let total = 0;
    let removed = 0;
    for (const c of cases) {
      const out = parseUrl(run(c).output);
      const left = new Set(out.ok ? out.value.query.map((p) => p.name.toLowerCase()) : []);
      for (const name of c.trackingParams) {
        total++;
        if (!left.has(name.toLowerCase())) removed++;
      }
    }
    expect(total).toBeGreaterThan(300);
    expect(removed / total).toBeGreaterThanOrEqual(0.95);
  });

  it('exercises every rule of the catalog at least once (Principio X)', () => {
    const used = new Set(cases.flatMap((c) => run(c).removed.map((item) => item.ruleId)));
    const ids = loadRuleFiles().map(({ rule }) => (rule as { id: string }).id);
    expect(ids.filter((id) => !used.has(id))).toEqual([]);
  });
});
