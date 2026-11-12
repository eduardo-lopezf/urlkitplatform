/** analyzeHost: the host TLS and DNS work on (002/T007). */
import { describe, expect, it } from 'vitest';
import { analyzeHost, type HostInfo } from '../../src/index.ts';

function ok(input: string): HostInfo {
  const result = analyzeHost(input);
  if (!result.ok) throw new Error(`expected ok for ${input}: ${result.error.code}`);
  return result.value;
}

describe('analyzeHost', () => {
  it('accepts a URL and keeps only its host', () => {
    expect(ok('https://www.example.com/a?b=1#c')).toEqual({
      unicode: 'www.example.com',
      ascii: 'www.example.com',
      registrable: 'example.com',
      port: null,
      kind: 'name',
      specialUse: false,
    });
  });

  it('accepts a bare host with an optional port', () => {
    expect(ok('example.org')).toMatchObject({ ascii: 'example.org', port: null });
    expect(ok('example.org:8443')).toMatchObject({ ascii: 'example.org', port: 8443 });
    expect(ok('https://example.org:443/')).toMatchObject({ port: null });
  });

  it('gives IDN hosts in Unicode and ASCII', () => {
    expect(ok('münchen.de')).toMatchObject({
      unicode: 'münchen.de',
      ascii: 'xn--mnchen-3ya.de',
      registrable: 'xn--mnchen-3ya.de',
    });
    expect(ok('https://xn--mnchen-3ya.de/')).toMatchObject({ unicode: 'münchen.de' });
  });

  it('flags IPv4 and bracketed IPv6 literals', () => {
    expect(ok('93.184.215.14')).toMatchObject({
      kind: 'ip',
      ascii: '93.184.215.14',
      registrable: null,
    });
    expect(ok('https://[2606:2800::1]:8443/')).toMatchObject({
      kind: 'ip',
      ascii: '[2606:2800::1]',
      port: 8443,
    });
  });

  it.each([
    'localhost',
    'app.localhost',
    'printer.local',
    'site.test',
    'nothing.invalid',
    'example',
    'www.example',
    'hidden.onion',
    'db.internal',
    'router.home.arpa',
  ])('flags the special-use name %s', (name) => {
    expect(ok(name).specialUse).toBe(true);
  });

  it('does not flag ordinary names that merely contain those words', () => {
    expect(ok('localhost-tools.com').specialUse).toBe(false);
    expect(ok('example.com').specialUse).toBe(false);
    expect(ok('test.org').specialUse).toBe(false);
  });

  it('returns a ToolError naming the invalid part', () => {
    const empty = analyzeHost('   ');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toMatchObject({ code: 'host.invalid', part: 'host' });

    const noHost = analyzeHost('mailto:alguien@example.com');
    expect(noHost.ok).toBe(false);
    if (!noHost.ok) expect(noHost.error).toMatchObject({ code: 'host.invalid', part: 'host' });

    const bad = analyzeHost('https://exa mple.com/');
    expect(bad.ok).toBe(false);
  });
});
