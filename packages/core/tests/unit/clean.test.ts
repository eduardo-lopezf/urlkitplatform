import { describe, expect, it } from 'vitest';
import { clean, type CleanResult } from '../../src/tools/clean/clean.ts';
import { catalog, domainRule, param, wrapper } from '../fixtures/catalog.ts';

function run(
  url: string,
  options: Partial<Parameters<typeof clean>[0]> = {},
  rules = basic(),
): CleanResult {
  const result = clean({ url, catalog: rules, ...options });
  if (!result.ok) throw new Error(`expected ok: ${result.error.code}`);
  return result.value;
}

function basic() {
  return catalog({
    version: '3.2.1',
    exact: {
      fbclid: [param('t.fbclid', { platform: 'Meta', reason: 'clean.reason.ad-click' })],
      ref: [
        param('t.ref', {
          mode: 'max',
          reason: 'clean.reason.affiliate',
          exceptions: ['github.com'],
        }),
      ],
      si: [param('t.si', { domains: ['youtube.com'] })],
    },
    prefixes: [{ prefix: 'utm_', rule: param('t.utm', { platform: 'UTM' }) }],
    wrappers: {
      'www.google.com': [wrapper('w.google', { platform: 'Google' })],
      'safelinks.example': [wrapper('w.safe', { subdomains: true, path: '/*', params: ['url'] })],
    },
    domains: { 'tienda.example': [domainRule('c.tienda')] },
  });
}

describe('clean', () => {
  it('echoes the version of the injected catalog', () => {
    expect(run('https://ejemplo.com/').catalogVersion).toBe('3.2.1');
    expect(run('https://ejemplo.com/', {}, catalog({ version: '9.0.0' })).catalogVersion).toBe(
      '9.0.0',
    );
  });

  it('removes tracking params with their reason and keeps functional ones', () => {
    const r = run('https://shop.example/p?id=7&utm_source=x&fbclid=y');
    expect(r.output).toBe('https://shop.example/p?id=7');
    expect(r.changed).toBe(true);
    expect(r.removed).toEqual([
      {
        kind: 'param',
        name: 'utm_source',
        value: 'x',
        ruleId: 't.utm',
        platform: 'UTM',
        reason: { code: 'clean.reason.campaign' },
      },
      {
        kind: 'param',
        name: 'fbclid',
        value: 'y',
        ruleId: 't.fbclid',
        platform: 'Meta',
        reason: { code: 'clean.reason.ad-click' },
      },
    ]);
  });

  it('matches names case-insensitively and keeps the original order and encoding', () => {
    const r = run('https://ejemplo.com/?b=%C3%A9&UTM_Medium=z&a=1+2');
    expect(r.output).toBe('https://ejemplo.com/?b=%C3%A9&a=1+2');
  });

  it('drops the "?" when every param is removed and keeps the fragment', () => {
    expect(run('https://ejemplo.com/a?utm_source=x#top').output).toBe('https://ejemplo.com/a#top');
  });

  it('honours the keep list', () => {
    const r = run('https://ejemplo.com/?utm_source=x&utm_medium=y', { keep: ['UTM_SOURCE'] });
    expect(r.output).toBe('https://ejemplo.com/?utm_source=x');
    expect(r.removed.map((i) => i.name)).toEqual(['utm_medium']);
  });

  it('applies domain-scoped rules only on their domains', () => {
    expect(run('https://www.youtube.com/watch?v=1&si=abc').output).toBe(
      'https://www.youtube.com/watch?v=1',
    );
    expect(run('https://ejemplo.com/?si=abc').output).toBe('https://ejemplo.com/?si=abc');
  });

  it('unwraps a known redirect wrapper', () => {
    const r = run(
      'https://www.google.com/url?q=https%3A%2F%2Fejemplo.com%2F%3Futm_medium%3Dz&sa=D',
    );
    expect(r.output).toBe('https://ejemplo.com/');
    expect(r.unwrapped).toEqual([
      'https://www.google.com/url?q=https%3A%2F%2Fejemplo.com%2F%3Futm_medium%3Dz&sa=D',
    ]);
    expect(r.removed[0]).toMatchObject({
      kind: 'wrapper',
      name: 'www.google.com',
      ruleId: 'w.google',
      reason: { code: 'clean.reason.wrapper', params: { platform: 'Google' } },
    });
    expect(r.removed[1]).toMatchObject({ kind: 'param', name: 'utm_medium' });
  });

  it('unwraps nested wrappers, outermost first', () => {
    const inner =
      'https://www.google.com/url?q=' + encodeURIComponent('https://destino.example/a?fbclid=1');
    const outer = 'https://eu.safelinks.example/x?url=' + encodeURIComponent(inner);
    const r = run(outer);
    expect(r.output).toBe('https://destino.example/a');
    expect(r.unwrapped).toEqual([outer, inner]);
  });

  it('does not unwrap when the destination is not an absolute http(s) URL', () => {
    expect(run('https://www.google.com/url?q=/search').output).toBe(
      'https://www.google.com/url?q=/search',
    );
    expect(run('https://www.google.com/url?q=javascript%3Aalert(1)').unwrapped).toEqual([]);
  });

  it('reports an already clean URL as unchanged', () => {
    const r = run('https://ejemplo.com/ruta?id=1');
    expect(r).toMatchObject({
      output: 'https://ejemplo.com/ruta?id=1',
      changed: false,
      removed: [],
      unwrapped: [],
    });
  });

  it('keeps max-mode params in safe mode and lists them in maxPreview', () => {
    const r = run('https://tienda.example/Nombre-Largo/dp/B000000001/?ref=abc&color=rojo');
    expect(r.mode).toBe('safe');
    expect(r.output).toBe('https://tienda.example/Nombre-Largo/dp/B000000001/?ref=abc&color=rojo');
    expect(r.maxPreview?.output).toBe('https://tienda.example/dp/B000000001');
    expect(r.maxPreview?.extra.map((i) => [i.kind, i.ruleId])).toEqual([
      ['param', 't.ref'],
      ['path', 'c.tienda'],
      ['param', 'c.tienda'],
    ]);
  });

  it('applies max rules in max mode and has no maxPreview', () => {
    const r = run('https://tienda.example/Nombre/dp/B000000001?ref=abc', { mode: 'max' });
    expect(r.output).toBe('https://tienda.example/dp/B000000001');
    expect(r.maxPreview).toBeNull();
    expect(r.removed.map((i) => i.ruleId)).toEqual(['t.ref', 'c.tienda']);
  });

  it('has maxPreview null in safe mode when max would add nothing', () => {
    expect(run('https://ejemplo.com/?utm_source=x').maxPreview).toBeNull();
  });

  it('respects functional-param exception domains', () => {
    expect(run('https://github.com/o/r/tree/main?ref=main', { mode: 'max' }).output).toBe(
      'https://github.com/o/r/tree/main?ref=main',
    );
    expect(run('https://ejemplo.com/?ref=newsletter', { mode: 'max' }).output).toBe(
      'https://ejemplo.com/',
    );
  });

  it('is deterministic', () => {
    const url =
      'https://www.google.com/url?q=' + encodeURIComponent('https://a.example/?utm_x=1&b=2');
    expect(run(url)).toEqual(run(url));
  });

  it('only cleans http(s) URLs', () => {
    const r = clean({ url: 'mailto:a@ejemplo.com?utm_source=x', catalog: basic() });
    expect(r).toMatchObject({
      ok: false,
      error: { code: 'url.unsupported-scheme', part: 'scheme' },
    });
  });

  it('returns parse errors instead of throwing', () => {
    expect(clean({ url: 'https://exa<mple.com', catalog: basic() })).toMatchObject({
      ok: false,
      error: { code: 'url.invalid' },
    });
  });
});
