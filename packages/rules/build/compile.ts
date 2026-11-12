/**
 * Rules compiler (T030): validates every rule against the schema, checks ids are unique, builds
 * the lookup indexes the core expects (RuleCatalog) and writes dist/compiled.ts.
 *
 *   node build/compile.ts          compile (fails if the lock is stale)
 *   node build/compile.ts --lock   record the current fingerprint after bumping the version
 *
 * The lock ties the catalog contents to its semantic version: changing a rule without bumping
 * package.json fails the build and the tests (Principio X).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type {
  DomainRule,
  MetadataCriteria,
  ParamRule,
  RuleCatalog,
  SecurityCriteria,
  WrapperRule,
} from '@urlkit/core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, 'data');
const RULE_DIRS = [DATA, join(DATA, 'domains')];
const NOT_RULES = new Set(['abuse-tlds.json']);

/**
 * v2 criteria (002 research R8): data, not rules. They live in their own folders, so the rule
 * loader never sees them, and are validated against schema/criteria.schema.json.
 */
export const CRITERIA_FILES = {
  headers: 'security/headers.json',
  tls: 'security/tls.json',
  severities: 'security/severities.json',
  precedence: 'metadata/precedence.json',
} as const;

interface SourceRule {
  id: string;
  kind: 'tracking-param' | 'wrapper' | 'domain-rule';
  mode: 'safe' | 'max';
  scope: 'global' | { domains: string[] };
  match: Record<string, unknown>;
  exceptions: { domains: string[] };
  platform: string;
  reason: ParamRule['reason'];
}

function ruleFiles(): string[] {
  return RULE_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.json') && !NOT_RULES.has(f))
      .sort()
      .map((f) => join(dir, f)),
  );
}

export function loadRuleFiles(): Array<{ file: string; rule: unknown }> {
  return ruleFiles().flatMap((file) => {
    const rules: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(rules)) throw new Error(`${file}: expected an array of rules`);
    return rules.map((rule: unknown) => ({ file, rule }));
  });
}

/** Hash of every data file, in a stable order. */
export function fingerprint(): string {
  const hash = createHash('sha256');
  const criteria = Object.values(CRITERIA_FILES).map((f) => join(DATA, f));
  for (const file of [...ruleFiles(), join(DATA, 'abuse-tlds.json'), ...criteria]) {
    hash.update(file.slice(DATA.length)).update('\0').update(readFileSync(file)).update('\0');
  }
  return hash.digest('hex');
}

export type LockCheck = { ok: true } | { ok: false; reason: string };

export function checkLock(
  lock: { version: string; fingerprint: string },
  version: string,
  current: string,
): LockCheck {
  if (lock.fingerprint === current && lock.version === version) return { ok: true };
  if (lock.fingerprint !== current && lock.version === version) {
    return {
      ok: false,
      reason: `Rules changed but the catalog version is still ${version}. Bump "version" in packages/rules/package.json (new rule: MINOR; changed id, mode or meaning: MAJOR), then run "node build/compile.ts --lock".`,
    };
  }
  return {
    ok: false,
    reason: `catalog.lock.json is stale (lock ${lock.version}, package ${version}). Run "node build/compile.ts --lock".`,
  };
}

export function compile(): RuleCatalog {
  const schema: unknown = JSON.parse(readFileSync(join(ROOT, 'schema/rule.schema.json'), 'utf8'));
  const validate = new Ajv2020({ allErrors: true }).compile(schema as object);
  const version = (
    JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }
  ).version;

  const catalog: RuleCatalog = {
    version,
    exact: {},
    prefixes: [],
    wrappers: {},
    domains: {},
    abuseTlds: [],
  };
  const seen = new Set<string>();

  for (const { file, rule } of loadRuleFiles()) {
    if (!validate(rule))
      throw new Error(`${file}: invalid rule ${JSON.stringify(validate.errors)}`);
    const r = rule as SourceRule;
    if (seen.has(r.id)) throw new Error(`${file}: duplicate rule id "${r.id}"`);
    seen.add(r.id);
    const meta = { id: r.id, mode: r.mode, platform: r.platform, reason: r.reason };

    if (r.kind === 'tracking-param') {
      const compiled: ParamRule = {
        ...meta,
        kind: 'tracking-param',
        domains: r.scope === 'global' ? null : r.scope.domains,
        exceptions: r.exceptions.domains,
      };
      for (const name of (r.match.names as string[] | undefined) ?? []) {
        (catalog.exact[name] ??= []).push(compiled);
      }
      for (const prefix of (r.match.prefixes as string[] | undefined) ?? []) {
        catalog.prefixes.push({ prefix, rule: compiled });
      }
    } else if (r.kind === 'wrapper') {
      for (const host of r.match.hosts as string[]) {
        const subdomains = host.startsWith('*.');
        const compiled: WrapperRule = {
          ...meta,
          kind: 'wrapper',
          path: r.match.path as string,
          params: r.match.params as string[],
          subdomains,
        };
        (catalog.wrappers[subdomains ? host.slice(2) : host] ??= []).push(compiled);
      }
    } else {
      const compiled: DomainRule = {
        ...meta,
        kind: 'domain-rule',
        pathPattern: r.match.pathPattern as string,
        canonicalPath: r.match.canonicalPath as string,
        query: r.match.query as DomainRule['query'],
      };
      new RegExp(compiled.pathPattern); // fails the build on an invalid pattern
      if (r.scope === 'global') throw new Error(`${file}: domain-rule "${r.id}" needs domains`);
      for (const domain of r.scope.domains) (catalog.domains[domain] ??= []).push(compiled);
    }
  }

  const abuse = JSON.parse(readFileSync(join(DATA, 'abuse-tlds.json'), 'utf8')) as {
    tlds: string[];
  };
  catalog.abuseTlds = [...abuse.tlds].sort();

  const criteria = loadCriteria();
  catalog.security = {
    headers: withoutMeta(criteria.headers) as unknown as SecurityCriteria['headers'],
    tls: withoutMeta(criteria.tls) as unknown as SecurityCriteria['tls'],
    severities: (criteria.severities as { severities: SecurityCriteria['severities'] }).severities,
  };
  catalog.metadata = {
    precedence: (criteria.precedence as { precedence: MetadataCriteria['precedence'] }).precedence,
  };
  return catalog;
}

/** Reads and validates every criteria file against its `$defs` entry of the schema. */
function loadCriteria(): Record<keyof typeof CRITERIA_FILES, Record<string, unknown>> {
  const schema = JSON.parse(readFileSync(join(ROOT, 'schema/criteria.schema.json'), 'utf8')) as {
    $id: string;
  };
  const ajv = new Ajv2020({ allErrors: true });
  ajv.addSchema(schema);
  const out = {} as Record<keyof typeof CRITERIA_FILES, Record<string, unknown>>;
  for (const [name, file] of Object.entries(CRITERIA_FILES) as Array<
    [keyof typeof CRITERIA_FILES, string]
  >) {
    const data = JSON.parse(readFileSync(join(DATA, file), 'utf8')) as Record<string, unknown>;
    const validate = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
    if (!validate) throw new Error(`criteria schema has no $defs/${name}`);
    if (!validate(data))
      throw new Error(`${file}: invalid criteria ${JSON.stringify(validate.errors)}`);
    out[name] = data;
  }
  return out;
}

/** `source` and `reviewed` document the data; they are not part of the compiled catalog. */
function withoutMeta(data: Record<string, unknown>): Record<string, unknown> {
  const { source: _source, reviewed: _reviewed, ...rest } = data;
  return rest;
}

function main(): void {
  const lockFile = join(ROOT, 'catalog.lock.json');
  const catalog = compile();
  const current = fingerprint();
  if (process.argv.includes('--lock')) {
    writeFileSync(
      lockFile,
      JSON.stringify({ version: catalog.version, fingerprint: current }, null, 2) + '\n',
    );
  }
  const lock = JSON.parse(readFileSync(lockFile, 'utf8')) as {
    version: string;
    fingerprint: string;
  };
  const check = checkLock(lock, catalog.version, current);
  if (!check.ok) throw new Error(check.reason);

  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(
    join(ROOT, 'dist/compiled.ts'),
    [
      '// Generated by packages/rules/build/compile.ts. Do not edit: change data/ and rebuild.',
      "import type { RuleCatalog } from '@urlkit/core';",
      '',
      `export const catalog: RuleCatalog = ${JSON.stringify(catalog, null, 2)};`,
      '',
      'export default catalog;',
      '',
    ].join('\n'),
  );
  const rules = Object.values(catalog.exact).flat().length + catalog.prefixes.length;
  console.warn(`rules: catalog ${catalog.version} compiled (${rules} param entries)`);
}

if (import.meta.main) main();
