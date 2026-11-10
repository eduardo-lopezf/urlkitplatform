/**
 * Proves the dependency rules of .dependency-cruiser.cjs actually fail (T013a): each rule has a
 * seeded violation in fixtures/, and the allowed cases must stay clean.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cruise, type ICruiseResult } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('../../.dependency-cruiser.cjs') as {
  forbidden: Array<{ name: string }>;
  options: Record<string, unknown>;
};
const fixtures = fileURLToPath(new URL('./fixtures', import.meta.url));

async function violations() {
  const { tsConfig: _ts, exclude: _ex, ...options } = config.options;
  const result = await cruise(['packages', 'apps'], {
    ...options,
    baseDir: fixtures,
    validate: true,
    ruleSet: { forbidden: config.forbidden },
  } as never);
  const output = result.output as ICruiseResult;
  return output.summary.violations.map((v) => ({ rule: v.rule.name, from: v.from, to: v.to }));
}

describe('package boundaries', () => {
  it('fails on one seeded violation per rule', async () => {
    const found = await violations();
    const expected: Array<[string, string]> = [
      ['core-never-imports-rules', 'packages/core/src/bad-rules.ts'],
      ['core-is-pure', 'packages/core/src/bad-rules.ts'],
      ['core-is-pure', 'packages/core/src/bad-i18n.ts'],
      ['contracts-only-core-codes', 'packages/contracts/src/bad.ts'],
      ['ui-knows-no-domain', 'packages/ui/src/bad.ts'],
      ['api-i18n-only-in-presentation', 'apps/api/src/routes/bad.ts'],
      ['packages-never-import-apps', 'packages/rules/src/bad.ts'],
    ];
    for (const [rule, from] of expected)
      expect(found, `${rule} from ${from}`).toContainEqual(expect.objectContaining({ rule, from }));
    for (const rule of config.forbidden.map((r) => r.name))
      expect(
        found.some((v) => v.rule === rule),
        rule,
      ).toBe(true);
  });

  it('allows type-only imports in the core, the code list in contracts and i18n in presentation', async () => {
    const offenders = (await violations()).map((v) => v.from);
    for (const allowed of [
      'packages/core/src/ok-type.ts',
      'packages/contracts/src/ok.ts',
      'apps/api/src/presentation/ok.ts',
    ]) {
      expect(offenders).not.toContain(allowed);
    }
  });
});
