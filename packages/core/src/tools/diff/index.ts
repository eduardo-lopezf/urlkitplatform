/**
 * URL Diff (FR-040–FR-042). Components are compared as written so that differences removed by
 * normalisation (host case, default port, equivalent encoding, trailing slash) are reported as
 * cosmetic instead of disappearing.
 */
import type { Schema, ToolDefinition } from '../../registry.ts';
import type { ParsedUrl, QueryParam, Result } from '../../types.ts';
import { normalizePath, normalizePercentEncoding } from '../../url/normalize.ts';
import { parseUrl } from '../../url/parse.ts';
import { splitRaw } from '../../url/raw.ts';
import type { RuleCatalog } from '../clean/catalog.ts';
import { matchParamRule } from '../clean/match.ts';
import { decodeFragment, encodeFragment, isRecord } from '../share.ts';

export type Component = 'scheme' | 'userinfo' | 'host' | 'port' | 'path' | 'query' | 'fragment';

export interface Difference {
  component: Component;
  param?: string;
  change: 'added' | 'removed' | 'modified';
  before?: string;
  after?: string;
}

export interface DiffOptions {
  ignoreParamOrder: boolean;
  ignoreTracking: boolean;
  normalize: boolean;
}

export interface DiffInput {
  a: string;
  b: string;
  options?: Partial<DiffOptions>;
}

export interface UrlComparison {
  catalogVersion?: string;
  a: string;
  b: string;
  options: DiffOptions;
  equivalent: boolean;
  differences: Difference[];
  cosmetic: Difference[];
}

export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  ignoreParamOrder: true,
  ignoreTracking: false,
  normalize: true,
};

interface Side {
  url: ParsedUrl;
  raw: ReturnType<typeof splitRaw>;
  params: QueryParam[];
}

/** Raw value as written and normalised value of a component; `null` = absent. */
type Pair = { raw: string | null; norm: string | null };

function components(side: Side): Array<[Exclude<Component, 'query'>, Pair]> {
  const { url, raw } = side;
  const userinfo = url.username + (url.password ? `:${url.password}` : '');
  return [
    ['scheme', { raw: raw.scheme, norm: url.scheme }],
    [
      'userinfo',
      { raw: raw.userinfo || null, norm: userinfo ? normalizePercentEncoding(userinfo) : null },
    ],
    ['host', { raw: raw.host || null, norm: url.host.ascii || null }],
    ['port', { raw: raw.port || null, norm: url.port.isDefault ? null : String(url.port.value) }],
    ['path', { raw: raw.path, norm: normalizePath(url.path.raw) }],
    [
      'fragment',
      {
        raw: raw.fragment,
        norm: url.fragment === null ? null : normalizePercentEncoding(url.fragment),
      },
    ],
  ];
}

function change(before: string | null, after: string | null): Difference['change'] {
  return before === null ? 'added' : after === null ? 'removed' : 'modified';
}

function difference(
  component: Component,
  before: string | null,
  after: string | null,
  param?: string,
): Difference {
  return {
    component,
    ...(param === undefined ? {} : { param }),
    change: change(before, after),
    ...(before === null ? {} : { before }),
    ...(after === null ? {} : { after }),
  };
}

const shown = (p: QueryParam) => p.value ?? '';
const keyOf = (p: QueryParam, normalize: boolean) =>
  p.rawValue === null ? '\u0000' : normalize ? normalizePercentEncoding(p.rawValue) : p.rawValue;

function compareQuery(
  a: Side,
  b: Side,
  options: DiffOptions,
  out: { real: Difference[]; cosmetic: Difference[] },
): void {
  const names = [...new Set([...a.params, ...b.params].map((p) => p.name))];
  const order = (s: Side) => s.params.map((p) => p.name);
  if (!options.ignoreParamOrder) {
    const sorted = (list: string[]) => [...list].sort().join('\u0000');
    if (
      sorted(order(a)) === sorted(order(b)) &&
      order(a).join('\u0000') !== order(b).join('\u0000')
    ) {
      out.real.push({
        component: 'query',
        change: 'modified',
        before: order(a).join(', '),
        after: order(b).join(', '),
      });
    }
  }
  for (const name of names) {
    let left = a.params.filter((p) => p.name === name);
    const right = b.params.filter((p) => p.name === name);
    if (options.ignoreParamOrder) {
      // Multiset comparison: pair equal values first, then compare what is left in order.
      const unmatched: QueryParam[] = [];
      for (const p of left) {
        const i = right.findIndex(
          (q) => keyOf(q, options.normalize) === keyOf(p, options.normalize),
        );
        if (i < 0) {
          unmatched.push(p);
          continue;
        }
        const [q] = right.splice(i, 1);
        if (q && p.rawValue !== q.rawValue)
          out.cosmetic.push(difference('query', p.rawValue, q.rawValue, name));
      }
      left = unmatched;
    }
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const p = left[i];
      const q = right[i];
      if (p && q && keyOf(p, options.normalize) === keyOf(q, options.normalize)) {
        if (p.rawValue !== q.rawValue)
          out.cosmetic.push(difference('query', p.rawValue, q.rawValue, name));
        continue;
      }
      out.real.push(difference('query', p ? shown(p) : null, q ? shown(q) : null, name));
    }
  }
}

function side(
  input: string,
  label: 'a' | 'b',
  options: DiffOptions,
  catalog?: RuleCatalog,
): Result<Side> {
  const parsed = parseUrl(input);
  if (!parsed.ok) {
    const { part, ...rest } = parsed.error;
    return { ok: false, error: { ...rest, part: part ? `${label}.${part}` : label } };
  }
  const url = parsed.value;
  const text = url.schemeAssumed
    ? url.input.startsWith('//')
      ? `https:${url.input}`
      : `https://${url.input}`
    : url.input;
  const params =
    options.ignoreTracking && catalog
      ? url.query.filter((p) => matchParamRule(p.name, url.registrableDomain, catalog) === null)
      : url.query;
  return { ok: true, value: { url, raw: splitRaw(text), params } };
}

export function diff(input: DiffInput & { catalog?: RuleCatalog }): Result<UrlComparison> {
  const options: DiffOptions = { ...DEFAULT_DIFF_OPTIONS, ...input.options };
  const a = side(input.a, 'a', options, input.catalog);
  if (!a.ok) return a;
  const b = side(input.b, 'b', options, input.catalog);
  if (!b.ok) return b;

  const out = { real: [] as Difference[], cosmetic: [] as Difference[] };
  const left = components(a.value);
  const right = new Map(components(b.value));
  for (const [component, pa] of left) {
    const pb = right.get(component) ?? { raw: null, norm: null };
    if (component === 'fragment') compareQuery(a.value, b.value, options, out); // keeps component order
    if (pa.raw === pb.raw) continue;
    if (options.normalize && pa.norm === pb.norm)
      out.cosmetic.push(difference(component, pa.raw, pb.raw));
    else out.real.push(difference(component, pa.raw, pb.raw));
  }

  return {
    ok: true,
    value: {
      ...(options.ignoreTracking && input.catalog ? { catalogVersion: input.catalog.version } : {}),
      a: input.a,
      b: input.b,
      options,
      equivalent: out.real.length === 0,
      differences: out.real,
      cosmetic: out.cosmetic,
    },
  };
}

const FLAGS: Array<[keyof DiffOptions, string]> = [
  ['ignoreParamOrder', 'p'],
  ['ignoreTracking', 't'],
  ['normalize', 'n'],
];

const input: Schema<DiffInput> = {
  safeParse: (data) =>
    isRecord(data) &&
    typeof data.a === 'string' &&
    typeof data.b === 'string' &&
    (data.options === undefined || isRecord(data.options))
      ? { success: true, data: data as unknown as DiffInput }
      : { success: false },
};

const output: Schema<UrlComparison> = {
  safeParse: (data) =>
    isRecord(data) && typeof data.equivalent === 'boolean'
      ? { success: true, data: data as unknown as UrlComparison }
      : { success: false },
};

export const diffTool: ToolDefinition<DiffInput, UrlComparison> = {
  id: 'diff',
  version: '1.0.0',
  runsOn: 'client',
  input,
  output,
  run: (value, ctx) => diff({ ...value, ...(ctx.catalog ? { catalog: ctx.catalog } : {}) }),
  sendTo: ['clean', 'parse', 'explain', 'inspect'],
  share: {
    // #a=<url>&b=<url>&o=<enabled options: p,t,n>
    encode: ({ a, b, options = {} }) => {
      const resolved = { ...DEFAULT_DIFF_OPTIONS, ...options };
      return encodeFragment([
        ['a', a],
        ['b', b],
        [
          'o',
          FLAGS.filter(([key]) => resolved[key])
            .map(([, flag]) => flag)
            .join(','),
        ],
      ]);
    },
    decode(fragment) {
      const f = decodeFragment(fragment);
      const a = f.get('a');
      const b = f.get('b');
      if (a === undefined || b === undefined) return null;
      const o = f.get('o');
      if (o === undefined) return { a, b };
      const flags = new Set(o.split(','));
      return {
        a,
        b,
        options: Object.fromEntries(
          FLAGS.map(([key, flag]) => [key, flags.has(flag)]),
        ) as unknown as DiffOptions,
      };
    },
  },
};
