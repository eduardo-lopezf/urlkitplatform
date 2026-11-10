import { describe, expect, it } from 'vitest';
import { diff, diffTool, type UrlComparison } from '../../src/tools/diff/index.ts';
import { catalog, param } from '../fixtures/catalog.ts';

const rules = catalog({
  version: '2.0.0',
  prefixes: [{ prefix: 'utm_', rule: param('t.utm') }],
  exact: { fbclid: [param('t.fb')] },
});

function run(
  a: string,
  b: string,
  options: Parameters<typeof diff>[0]['options'] = {},
): UrlComparison {
  const r = diff({ a, b, options, catalog: rules });
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}

describe('diff', () => {
  it('uses the documented defaults', () => {
    expect(run('https://a.example/', 'https://a.example/').options).toEqual({
      ignoreParamOrder: true,
      ignoreTracking: false,
      normalize: true,
    });
  });

  it('reports only utm_campaign when the rest differs only in order (acceptance 1)', () => {
    const r = run(
      'https://a.example/p?x=1&y=2&utm_campaign=otono',
      'https://a.example/p?y=2&x=1&utm_campaign=invierno',
    );
    expect(r.equivalent).toBe(false);
    expect(r.differences).toEqual([
      {
        component: 'query',
        param: 'utm_campaign',
        change: 'modified',
        before: 'otono',
        after: 'invierno',
      },
    ]);
  });

  it('reports the order when ignoreParamOrder is off', () => {
    const r = run('https://a.example/?x=1&y=2', 'https://a.example/?y=2&x=1', {
      ignoreParamOrder: false,
    });
    expect(r.differences).toEqual([
      { component: 'query', change: 'modified', before: 'x, y', after: 'y, x' },
    ]);
  });

  it('classifies added, removed and modified params', () => {
    const r = run('https://a.example/?a=1&b=2', 'https://a.example/?b=3&c=4');
    expect(r.differences).toEqual([
      { component: 'query', param: 'a', change: 'removed', before: '1' },
      { component: 'query', param: 'b', change: 'modified', before: '2', after: '3' },
      { component: 'query', param: 'c', change: 'added', after: '4' },
    ]);
  });

  it('compares repeated params position by position', () => {
    const r = run('https://a.example/?x=1&x=2', 'https://a.example/?x=1&x=3&x=4');
    expect(r.differences).toEqual([
      { component: 'query', param: 'x', change: 'modified', before: '2', after: '3' },
      { component: 'query', param: 'x', change: 'added', after: '4' },
    ]);
    expect(run('https://a.example/?x=1&x=2', 'https://a.example/?x=2&x=1').equivalent).toBe(true);
  });

  it('classifies differences per component', () => {
    const r = run('http://u@a.example:8080/p#f', 'https://b.example/q');
    expect(r.differences.map((d) => [d.component, d.change])).toEqual([
      ['scheme', 'modified'],
      ['userinfo', 'removed'],
      ['host', 'modified'],
      ['port', 'removed'],
      ['path', 'modified'],
      ['fragment', 'removed'],
    ]);
  });

  it('treats normalised URLs as equivalent and lists the cosmetic differences (acceptance 2)', () => {
    const r = run('https://EJEMPLO.com:443/a%7Eb/?q=%c3%a9', 'https://ejemplo.com/a~b?q=%C3%A9');
    expect(r.equivalent).toBe(true);
    expect(r.differences).toEqual([]);
    expect(r.cosmetic.map((d) => d.component)).toEqual(['host', 'port', 'path', 'query']);
  });

  it('keeps those differences real when normalize is off', () => {
    const r = run('https://EJEMPLO.com/a/', 'https://ejemplo.com/a', { normalize: false });
    expect(r.equivalent).toBe(false);
    expect(r.differences.map((d) => d.component)).toEqual(['host', 'path']);
    expect(r.cosmetic).toEqual([]);
  });

  it('ignores tracking params with the injected catalog and reports its version', () => {
    const r = run('https://a.example/?id=1&utm_source=x', 'https://a.example/?id=1&fbclid=y', {
      ignoreTracking: true,
    });
    expect(r.equivalent).toBe(true);
    expect(r.catalogVersion).toBe('2.0.0');
    expect(run('https://a.example/', 'https://a.example/').catalogVersion).toBeUndefined();
  });

  it('names the invalid side', () => {
    expect(diff({ a: 'https://a.example/', b: 'https://exa<mple/', catalog: rules })).toMatchObject(
      { ok: false, error: { code: 'url.invalid', part: 'b.host' } },
    );
  });

  it('shares both URLs and the options in the fragment', () => {
    const input = {
      a: 'https://a.example/?x=1',
      b: 'https://b.example/',
      options: { ignoreParamOrder: false, ignoreTracking: true, normalize: true },
    };
    const fragment = diffTool.share.encode(input);
    expect(fragment).toBe(
      `a=${encodeURIComponent(input.a)}&b=${encodeURIComponent(input.b)}&o=t%2Cn`,
    );
    expect(diffTool.share.decode(fragment)).toEqual(input);
  });
});
