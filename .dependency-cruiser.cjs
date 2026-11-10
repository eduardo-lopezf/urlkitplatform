/**
 * Package dependency boundaries (plan.md, "Grafo de dependencias"; docs/arquitectura.md §6).
 * Path patterns are unanchored so the same rules apply to the seeded fixtures in
 * tooling/boundaries/fixtures, which prove that each rule actually fails the check.
 * Tests and build scripts are excluded: they may import across packages to verify contracts.
 */
const SRC = '(^|/)';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-is-pure',
      comment:
        'packages/core imports nothing from the repository except types (never rules, contracts, i18n, ui or apps).',
      severity: 'error',
      from: { path: `${SRC}packages/core/src/` },
      to: {
        path: `${SRC}(packages/(rules|contracts|i18n|ui)|apps)/`,
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'core-never-imports-rules',
      comment: 'The rules catalog is injected into the core, never imported (Principio X).',
      severity: 'error',
      from: { path: `${SRC}packages/core/src/` },
      to: { path: `${SRC}packages/rules/` },
    },
    {
      name: 'contracts-only-core-codes',
      comment: 'packages/contracts imports from the core only the code list (codes.ts).',
      severity: 'error',
      from: { path: `${SRC}packages/contracts/src/` },
      to: {
        path: `${SRC}packages/(core|rules|i18n|ui)/`,
        pathNot: `${SRC}packages/core/src/codes\\.ts$`,
      },
    },
    {
      name: 'ui-knows-no-domain',
      comment: 'packages/ui receives data and emits events; it imports no domain package.',
      severity: 'error',
      from: { path: `${SRC}packages/ui/src/` },
      to: { path: `${SRC}(packages/(core|rules|contracts|i18n)|apps)/` },
    },
    {
      name: 'api-i18n-only-in-presentation',
      comment: 'Only apps/api/src/presentation/ may import packages/i18n (optional ?lang).',
      severity: 'error',
      from: { path: `${SRC}apps/api/src/`, pathNot: `${SRC}apps/api/src/presentation/` },
      to: { path: `${SRC}packages/i18n/` },
    },
    {
      name: 'packages-never-import-apps',
      severity: 'error',
      from: { path: `${SRC}packages/` },
      to: { path: `${SRC}apps/` },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(tests|build|dist|node_modules)/|\\.(test|spec)\\.ts$|(^|/)\\.astro/' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    preserveSymlinks: false,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'default'],
      extensions: ['.ts', '.js', '.mjs', '.vue', '.json'],
    },
  },
};
