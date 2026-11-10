import { describe, expect, it } from 'vitest';
import { parseUrl, serializeUrl, toParts, type ParsedUrl } from '../../src/index.ts';
import {
  addParam,
  moveParam,
  parseTool,
  removeParam,
  setComponent,
  setParam,
} from '../../src/tools/parse/index.ts';

const parsed = (url: string): ParsedUrl => {
  const r = parseUrl(url);
  if (!r.ok) throw new Error(url);
  return r.value;
};
const value = <T>(r: { ok: true; value: T } | { ok: false }): T => {
  if (!r.ok) throw new Error('expected ok');
  return r.value;
};

describe('parse tool', () => {
  it('returns exactly the ParsedUrl of the core', async () => {
    const url = 'https://usuario:clave@münchen.de:8080/a%20b/c?x=1&x=2&y=#sec';
    expect(await parseTool.run({ url }, {})).toEqual(parseUrl(url));
  });

  it('keeps the password so the UI can mask it, never drops it', () => {
    expect(parsed('https://usuario:clave@ejemplo.com/').password).toBe('clave');
  });

  it('edits a param value and re-encodes it', () => {
    const r = value(
      setParam(parsed('https://ejemplo.com/?q=hola&x=1'), 0, { value: 'café con leche&más' }),
    );
    expect(r.href).toBe('https://ejemplo.com/?q=caf%C3%A9%20con%20leche%26m%C3%A1s&x=1');
    expect(r.query[0]?.value).toBe('café con leche&más');
  });

  it('renames a param', () => {
    expect(value(setParam(parsed('https://ejemplo.com/?a=1'), 0, { name: 'b' })).href).toBe(
      'https://ejemplo.com/?b=1',
    );
  });

  it('adds, removes and reorders params', () => {
    let url = parsed('https://ejemplo.com/ruta?a=1#f');
    url = value(addParam(url, 'b', '2'));
    url = value(addParam(url, 'c', null));
    expect(url.href).toBe('https://ejemplo.com/ruta?a=1&b=2&c#f');
    url = value(moveParam(url, 2, 0));
    expect(url.href).toBe('https://ejemplo.com/ruta?c&a=1&b=2#f');
    url = value(removeParam(url, 1));
    expect(url.href).toBe('https://ejemplo.com/ruta?c&b=2#f');
    url = value(removeParam(value(removeParam(url, 0)), 0));
    expect(url.href).toBe('https://ejemplo.com/ruta#f');
  });

  it('edits components and rebuilds a valid URL', () => {
    const base = parsed('https://ejemplo.com/a?x=1');
    expect(value(setComponent(base, 'host', 'münchen.de')).host.ascii).toBe('xn--mnchen-3ya.de');
    expect(value(setComponent(base, 'port', '8443')).href).toBe('https://ejemplo.com:8443/a?x=1');
    expect(value(setComponent(base, 'port', '')).port.isDefault).toBe(true);
    expect(value(setComponent(base, 'path', '/otra ruta')).href).toBe(
      'https://ejemplo.com/otra%20ruta?x=1',
    );
    expect(value(setComponent(base, 'fragment', 'sección')).fragment).toBe('secci%C3%B3n');
    expect(value(setComponent(base, 'fragment', null)).fragment).toBeNull();
    expect(value(setComponent(base, 'username', 'yo')).href).toBe('https://yo@ejemplo.com/a?x=1');
    expect(value(setComponent(base, 'scheme', 'http')).href).toBe('http://ejemplo.com/a?x=1');
  });

  it('rejects invalid edits naming the part instead of producing a wrong URL', () => {
    const base = parsed('https://ejemplo.com/');
    expect(setComponent(base, 'port', '99999')).toMatchObject({
      ok: false,
      error: { code: 'url.invalid', part: 'port' },
    });
    expect(setComponent(base, 'port', 'abc')).toMatchObject({ ok: false, error: { part: 'port' } });
    expect(setComponent(base, 'host', 'exa mple')).toMatchObject({
      ok: false,
      error: { part: 'host' },
    });
    expect(setComponent(base, 'scheme', '1http')).toMatchObject({
      ok: false,
      error: { part: 'scheme' },
    });
    expect(setParam(base, 5, { value: 'x' })).toMatchObject({ ok: false });
  });

  it('round-trips after edits', () => {
    const edited = value(addParam(parsed('https://ejemplo.com/?a=%E0%A4%A'), 'b', 'ñ'));
    expect(serializeUrl(toParts(edited))).toEqual({ ok: true, value: edited.href });
    expect(edited.query[0]?.rawValue).toBe('%E0%A4%A');
  });

  it('warns when implementations may read the URL differently (FR-022)', () => {
    const codes = (url: string) => parsed(url).warnings.map((w) => w.code);
    expect(codes('https://ejemplo.com\\admin')).toContain('parse.warning.backslash');
    expect(codes('http://0x7f.1/')).toContain('parse.warning.numeric-ipv4');
    expect(codes('git+ssh://ejemplo.com/repo')).toContain('parse.warning.non-special-scheme');
  });

  it('shares the URL in the fragment', () => {
    const url = 'https://ejemplo.com/?a=1&b=2#x';
    const fragment = parseTool.share.encode({ url });
    expect(fragment).toBe(`u=${encodeURIComponent(url)}`);
    expect(parseTool.share.decode(`#${fragment}`)).toEqual({ url });
    expect(parseTool.share.decode('#nada')).toBeNull();
  });
});
