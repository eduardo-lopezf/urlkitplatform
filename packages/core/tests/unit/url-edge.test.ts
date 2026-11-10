import { describe, expect, it } from 'vitest';
import { MAX_INPUT_LENGTH, parseUrl, type ParsedUrl } from '../../src/index.ts';

function ok(input: string): ParsedUrl {
  const result = parseUrl(input);
  if (!result.ok) throw new Error(`expected ok for ${input}: ${result.error.code}`);
  return result.value;
}

const codes = (url: ParsedUrl) => url.warnings.map((w) => w.code);

describe('parseUrl edge cases', () => {
  it('assumes https:// when the scheme is missing and warns', () => {
    const url = ok('ejemplo.com/ruta');
    expect(url.schemeAssumed).toBe(true);
    expect(url.href).toBe('https://ejemplo.com/ruta');
    expect(url.input).toBe('ejemplo.com/ruta');
    expect(codes(url)).toContain('input.scheme-assumed');
  });

  it('assumes https:// for host:port and protocol-relative inputs', () => {
    expect(ok('localhost:8080/x').href).toBe('https://localhost:8080/x');
    expect(ok('ejemplo.com:8443').port.value).toBe(8443);
    expect(ok('//ejemplo.com/a').href).toBe('https://ejemplo.com/a');
  });

  it('does not assume a scheme for real schemes', () => {
    const url = ok('mailto:alguien@ejemplo.com');
    expect(url.schemeAssumed).toBe(false);
    expect(url.scheme).toBe('mailto');
    expect(url.host.kind).toBe('none');
    expect(ok('tel:+34600000000').scheme).toBe('tel');
  });

  it('trims surrounding whitespace', () => {
    expect(ok('  https://ejemplo.com/  \n').input).toBe('https://ejemplo.com/');
  });

  it(`accepts up to ${MAX_INPUT_LENGTH} characters and rejects longer input`, () => {
    const base = 'https://ejemplo.com/?q=';
    const max = base + 'a'.repeat(MAX_INPUT_LENGTH - base.length);
    expect(max.length).toBe(32_000);
    expect(parseUrl(max).ok).toBe(true);
    const tooLong = parseUrl(max + 'a');
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error.code).toBe('url.too-long');
  });

  it('uses the first of several URLs and warns', () => {
    const url = ok('https://a.example/1 https://b.example/2');
    expect(url.href).toBe('https://a.example/1');
    expect(codes(url)).toContain('input.multiple-urls');
    expect(codes(ok('https://a.example/1\nb.example/2'))).toContain('input.multiple-urls');
  });

  it('keeps repeated params in order', () => {
    const url = ok('https://ejemplo.com/?x=1&x=2&y=3');
    expect(url.query.map((p) => [p.index, p.name, p.value])).toEqual([
      [0, 'x', '1'],
      [1, 'x', '2'],
      [2, 'y', '3'],
    ]);
  });

  it('distinguishes a param without "=" (null) from an empty value', () => {
    const url = ok('https://ejemplo.com/?x&y=');
    expect(url.query[0]).toMatchObject({ name: 'x', value: null, rawValue: null });
    expect(url.query[1]).toMatchObject({ name: 'y', value: '', rawValue: '' });
  });

  it('decodes params but keeps the raw form', () => {
    const url = ok('https://ejemplo.com/?q=caf%C3%A9+con+leche&a%20b=1');
    expect(url.query[0]).toMatchObject({
      value: 'café con leche',
      rawValue: 'caf%C3%A9+con+leche',
    });
    expect(url.query[1]).toMatchObject({ name: 'a b', rawName: 'a%20b' });
  });

  it('flags invalid percent-encoding instead of failing', () => {
    const url = ok('https://ejemplo.com/?q=%E0%A4%A&ok=1');
    expect(url.query[0]).toMatchObject({ encodingValid: false, rawValue: '%E0%A4%A' });
    expect(url.query[1]?.encodingValid).toBe(true);
    expect(codes(url)).toContain('parse.warning.invalid-encoding');
  });

  it('converts IDN hosts to Punycode and back', () => {
    const url = ok('https://münchen.de/');
    expect(url.host).toEqual({ ascii: 'xn--mnchen-3ya.de', unicode: 'münchen.de', kind: 'domain' });
    expect(url.registrableDomain).toBe('xn--mnchen-3ya.de');
  });

  it('splits registrable domain and subdomain using the Public Suffix List', () => {
    const url = ok('https://www.tienda.example.co.uk/');
    expect(url.registrableDomain).toBe('example.co.uk');
    expect(url.subdomain).toBe('www.tienda');
    expect(ok('https://ejemplo.com/').subdomain).toBeNull();
  });

  it('recognises IPv4 and IPv6 hosts', () => {
    const v4 = ok('http://192.168.0.1/');
    expect(v4.host.kind).toBe('ipv4');
    expect(v4.registrableDomain).toBeNull();
    const v6 = ok('http://[::1]:8080/');
    expect(v6.host).toMatchObject({ ascii: '[::1]', kind: 'ipv6' });
    expect(v6.port).toEqual({ value: 8080, isDefault: false });
  });

  it('normalises unusual numeric IPv4 forms and warns', () => {
    for (const input of ['http://0x7f.1/', 'http://2130706433/', 'http://0177.0.0.1/']) {
      const url = ok(input);
      expect(url.host).toMatchObject({ ascii: '127.0.0.1', kind: 'ipv4' });
      expect(codes(url)).toContain('parse.warning.numeric-ipv4');
    }
    expect(codes(ok('http://127.0.0.1/'))).not.toContain('parse.warning.numeric-ipv4');
  });

  it('warns about backslashes, which browsers read as slashes', () => {
    expect(codes(ok('https://ejemplo.com\\a\\b'))).toContain('parse.warning.backslash');
  });

  it('reports the default port', () => {
    expect(ok('https://ejemplo.com/').port).toEqual({ value: 443, isDefault: true });
    expect(ok('https://ejemplo.com:443/').port).toEqual({ value: 443, isDefault: true });
    expect(ok('http://ejemplo.com/').port).toEqual({ value: 80, isDefault: true });
  });

  it('parses the quickstart example component by component', () => {
    const url = ok('https://usuario@münchen.de:8080/a%20b/c?x=1&x=2&y=#sec');
    expect(url.username).toBe('usuario');
    expect(url.password).toBe('');
    expect(url.host.unicode).toBe('münchen.de');
    expect(url.host.ascii).toBe('xn--mnchen-3ya.de');
    expect(url.port).toEqual({ value: 8080, isDefault: false });
    expect(url.path).toEqual({ raw: '/a%20b/c', decoded: '/a b/c', segments: ['a b', 'c'] });
    expect(url.query.map((p) => [p.name, p.value])).toEqual([
      ['x', '1'],
      ['x', '2'],
      ['y', ''],
    ]);
    expect(url.fragment).toBe('sec');
  });

  it('distinguishes an empty fragment from no fragment', () => {
    expect(ok('https://ejemplo.com/#').fragment).toBe('');
    expect(ok('https://ejemplo.com/').fragment).toBeNull();
  });

  it('returns url.invalid naming the problematic part', () => {
    const host = parseUrl('https://exa<mple.com/');
    expect(host.ok).toBe(false);
    if (!host.ok) expect(host.error).toMatchObject({ code: 'url.invalid', part: 'host' });
    const port = parseUrl('https://ejemplo.com:99999/');
    if (!port.ok) expect(port.error).toMatchObject({ code: 'url.invalid', part: 'port' });
    expect(port.ok).toBe(false);
    const empty = parseUrl('   ');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.code).toBe('url.invalid');
  });

  it('never throws on arbitrary input', () => {
    for (const input of ['%', '::::', 'http://', 'https://[::1', '\u0000', 'xn--a.com', '😀']) {
      expect(() => parseUrl(input)).not.toThrow();
    }
  });
});
