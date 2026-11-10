import { describe, expect, it } from 'vitest';
import { explain, explainTool, type Explanation } from '../../src/tools/explain/index.ts';
import { catalog, param } from '../fixtures/catalog.ts';

const rules = catalog({
  version: '4.1.0',
  prefixes: [{ prefix: 'utm_', rule: param('t.utm', { platform: 'UTM' }) }],
  exact: { fbclid: [param('t.fb', { platform: 'Meta' })] },
  abuseTlds: ['xyz', 'zip'],
});

function run(url: string): Explanation {
  const r = explain({ url, catalog: rules });
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}
const ids = (url: string) => run(url).signals.map((s) => s.id);

describe('explain parts', () => {
  it('explains a campaign URL part by part, with the platform of each tracking param', () => {
    const r = run(
      'https://www.tienda.example.com/ofertas?utm_source=newsletter&fbclid=abc&color=rojo#top',
    );
    expect(r.catalogVersion).toBe('4.1.0');
    expect(r.parts.map((p) => [p.component, p.message.code])).toEqual([
      ['scheme', 'explain.part.scheme.https'],
      ['host', 'explain.part.host'],
      ['registrable-domain', 'explain.part.registrable-domain'],
      ['subdomain', 'explain.part.subdomain'],
      ['path', 'explain.part.path'],
      ['param', 'explain.part.param.tracking'],
      ['param', 'explain.part.param.tracking'],
      ['param', 'explain.part.param.functional'],
      ['fragment', 'explain.part.fragment'],
    ]);
    expect(r.parts.find((p) => p.value === 'example.com')?.component).toBe('registrable-domain');
    expect(r.parts.filter((p) => p.platform).map((p) => [p.value, p.platform])).toEqual([
      ['utm_source=newsletter', 'UTM'],
      ['fbclid=abc', 'Meta'],
    ]);
    expect(r.parts[5]?.message.params).toEqual({ name: 'utm_source', platform: 'UTM' });
  });

  it('explains other schemes without treating them as web pages', () => {
    expect(run('mailto:a@ejemplo.com').parts[0]?.message).toEqual({
      code: 'explain.part.scheme.other',
      params: { scheme: 'mailto' },
    });
    expect(run('javascript:alert(1)').parts[0]?.message.code).toBe('explain.part.scheme.dangerous');
  });
});

describe('explain signals', () => {
  it('userinfo-deception: names the real site (acceptance 2)', () => {
    const r = run('https://paypal.com@ejemplo-malo.xyz/login');
    const signal = r.signals.find((s) => s.id === 'userinfo-deception');
    expect(signal).toMatchObject({
      severity: 'caution',
      evidence: 'paypal.com',
      message: { params: { shown: 'paypal.com', real: 'ejemplo-malo.xyz' } },
    });
    expect(r.url.registrableDomain).toBe('ejemplo-malo.xyz');
  });

  it('ip-host for IPv4, IPv6 and unusual numeric forms', () => {
    expect(ids('http://192.168.1.1/')).toContain('ip-host');
    expect(ids('http://[2001:db8::1]/')).toContain('ip-host');
    expect(run('http://3232235777/').signals.find((s) => s.id === 'ip-host')?.evidence).toBe(
      '3232235777',
    );
  });

  it('homograph: a whole label in another script that looks Latin, with its Punycode (acceptance 3)', () => {
    const r = run('https://аррӏе.com/'); // Cyrillic
    const signal = r.signals.find((s) => s.id === 'homograph');
    expect(signal).toMatchObject({ severity: 'caution', evidence: r.url.host.ascii });
    expect(signal?.message.params).toEqual({ ascii: r.url.host.ascii });
    expect(r.url.host.ascii.startsWith('xn--')).toBe(true);
  });

  it('mixed-scripts: Latin mixed with Cyrillic in one label, but not legitimate CJK combinations', () => {
    expect(ids('https://pаypal.com/')).toContain('mixed-scripts'); // Cyrillic а
    expect(ids('https://münchen.de/')).toEqual([]);
    expect(ids('https://日本語テスト.jp/')).not.toContain('mixed-scripts');
    expect(ids('https://ελληνικά.gr/')).toEqual([]);
  });

  it('excessive-encoding and double-encoding', () => {
    expect(ids('https://ejemplo.com/%6C%6F%67%69%6E')).toContain('excessive-encoding');
    expect(ids('https://ejemplo.com/a?r=%2568%2574%2574%2570')).toContain('double-encoding');
    expect(ids('https://ejemplo.com/buscar?q=caf%C3%A9')).toEqual([]);
  });

  it('dangerous-scheme, unusual-port, nested-url and abuse-tld', () => {
    expect(ids('javascript:alert(1)')).toContain('dangerous-scheme');
    expect(ids('data:text/html,hola')).toContain('dangerous-scheme');
    expect(ids('https://ejemplo.com:8081/')).toContain('unusual-port');
    expect(ids('https://ejemplo.com:8443/')).not.toContain('unusual-port');
    expect(
      run('https://ejemplo.com/r?to=https%3A%2F%2Fotro.example%2Fx').signals.find(
        (s) => s.id === 'nested-url',
      )?.evidence,
    ).toBe('https://otro.example/x');
    expect(ids('https://oferta.xyz/')).toContain('abuse-tld');
  });

  it('never returns a verdict: severity is only info or caution, cautions first', () => {
    const r = run('https://paypal.com@ejemplo-malo.xyz:8081/a?u=https%3A%2F%2Fx.example');
    expect(r.signals.length).toBeGreaterThanOrEqual(3);
    expect(r.signals.every((s) => s.severity === 'info' || s.severity === 'caution')).toBe(true);
    const severities = r.signals.map((s) => s.severity);
    expect(severities).toEqual(
      [...severities].sort((x, y) => (x === y ? 0 : x === 'caution' ? -1 : 1)),
    );
  });

  it('is deterministic', () => {
    const url = 'https://pаypal.com@xn--80ak6aa92e.com:81/%2541?u=www.ejemplo.com';
    expect(run(url)).toEqual(run(url));
  });

  it('is registered with a shareable fragment', () => {
    expect(
      explainTool.share.decode(explainTool.share.encode({ url: 'https://a.example/?x=1' })),
    ).toEqual({ url: 'https://a.example/?x=1' });
  });
});
