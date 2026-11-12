import { describe, expect, it } from 'vitest';
import type { FetchHop, HopResponse } from '../../src/index.ts';
import {
  classifyStatus,
  detectJsRedirect,
  findInterstitialLink,
  inspect,
  inspectTool,
  MAX_HOPS,
  parseMetaRefresh,
} from '../../src/tools/inspect/index.ts';

const redirect = (status: number, location: string, durationMs = 10): HopResponse => ({
  kind: 'response',
  status,
  location,
  html: null,
  durationMs,
});
const page = (html: string | null = null, status = 200): HopResponse => ({
  kind: 'response',
  status,
  location: null,
  html,
  durationMs: 20,
});

function server(map: Record<string, HopResponse>): FetchHop & { calls: string[] } {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    return map[url] ?? page();
  };
  return Object.assign(fn, { calls });
}

describe('hop interpretation', () => {
  it('classifies redirect status codes', () => {
    expect([301, 308].map(classifyStatus)).toEqual(['permanent', 'permanent']);
    expect([302, 303, 307].map(classifyStatus)).toEqual(['temporary', 'temporary', 'temporary']);
    expect([200, 204, 304, 404, 500].map(classifyStatus)).toEqual([
      'final',
      'final',
      'final',
      'final',
      'final',
    ]);
  });

  it('parses meta refresh in its usual spellings', () => {
    expect(
      parseMetaRefresh('<meta http-equiv="refresh" content="0; url=https://a.example/">'),
    ).toBe('https://a.example/');
    expect(parseMetaRefresh("<META HTTP-EQUIV='Refresh' CONTENT='5;URL=/next'>")).toBe('/next');
    expect(
      parseMetaRefresh('<meta content="0;url=\'https://b.example\'" http-equiv="refresh">'),
    ).toBe('https://b.example');
    expect(parseMetaRefresh('<meta http-equiv="refresh" content="30">')).toBeNull();
    expect(parseMetaRefresh('<p>refresh url=https://x</p>')).toBeNull();
  });

  it('detects JavaScript redirects and marks only literal location assignments as followable', () => {
    expect(
      detectJsRedirect('<script>window.location.href = "https://a.example/";</script>'),
    ).toEqual({ url: 'https://a.example/', literal: true });
    expect(detectJsRedirect("<script>location.replace('/b')</script>")).toEqual({
      url: '/b',
      literal: true,
    });
    expect(detectJsRedirect('<script>document.location = "https://c.example"</script>')).toEqual({
      url: 'https://c.example',
      literal: true,
    });
    expect(detectJsRedirect('<script>window.location = target + "?x=1";</script>')).toEqual({
      url: null,
      literal: false,
    });
    expect(detectJsRedirect('<script>console.log("location")</script>')).toBeNull();
    expect(detectJsRedirect(null)).toBeNull();
  });

  it('ignores identifiers that only end in "location"', () => {
    expect(detectJsRedirect('<script>const geolocation = "/end"</script>')).toBeNull();
    expect(detectJsRedirect('<script>myLocation.replace("/x")</script>')).toBeNull();
    expect(detectJsRedirect('<script>var $location = "/x";</script>')).toBeNull();
    expect(
      detectJsRedirect('<script>const f = ({ _location = location }) => 1;</script>'),
    ).toBeNull();
    expect(detectJsRedirect('<script>a.location = "/x";</script>')).toBeNull();
    expect(detectJsRedirect('<script>if(x)window.location="/y";</script>')).toEqual({
      url: '/y',
      literal: true,
    });
  });

  // Found validating 002 against ubuntu.com: an HTML attribute is not JavaScript.
  it('only looks for JavaScript redirects inside <script> elements', () => {
    expect(
      detectJsRedirect(
        '<div id="contact-form-container" data-form-location="/shared/forms/form-template"></div>',
      ),
    ).toBeNull();
    expect(detectJsRedirect('<x-map location="/places"></x-map>')).toBeNull();
    expect(detectJsRedirect('<p>Set location = "/here" in the settings.</p>')).toBeNull();
    expect(
      detectJsRedirect(
        '<div data-form-location="/form"></div><script type="text/javascript">location.href="/real"</script>',
      ),
    ).toEqual({ url: '/real', literal: true });
  });

  // Found validating 002 against duckduckgo.com.
  it('decodes HTML entities in the meta refresh content', () => {
    expect(
      parseMetaRefresh(
        '<meta http-equiv="refresh" content="0; url=&quot;https://html.duckduckgo.com/html&quot;"/>',
      ),
    ).toBe('https://html.duckduckgo.com/html');
    expect(parseMetaRefresh('<meta http-equiv="refresh" content="0;url=/next?a=1&amp;b=2">')).toBe(
      '/next?a=1&b=2',
    );
  });

  it('ignores a meta refresh inside <noscript>, which a browser with scripts never applies', () => {
    expect(
      parseMetaRefresh(
        '<noscript><meta http-equiv="refresh" content="0; url=/html"/></noscript><p>home</p>',
      ),
    ).toBeNull();
    expect(
      parseMetaRefresh(
        '<noscript><style>body{}</style></noscript><meta http-equiv="refresh" content="0;url=/go">',
      ),
    ).toBe('/go');
  });
});

describe('inspect', () => {
  it('follows a two-hop chain and reports three steps with status and duration', async () => {
    const fetchHop = server({
      'https://bit.example/x': redirect(301, 'https://t.example/y'),
      'https://t.example/y': redirect(302, 'https://destino.example/final'),
    });
    const r = await inspect('https://bit.example/x', fetchHop);
    expect(r).toMatchObject({
      ok: true,
      value: { stopReason: 'final', final: 'https://destino.example/final', totalMs: 40 },
    });
    if (!r.ok) return;
    expect(r.value.hops.map((h) => [h.index, h.status, h.type, h.location])).toEqual([
      [0, 301, 'permanent', 'https://t.example/y'],
      [1, 302, 'temporary', 'https://destino.example/final'],
      [2, 200, 'final', null],
    ]);
  });

  it('resolves relative Location headers against the current hop', async () => {
    const fetchHop = server({ 'https://a.example/dir/x': redirect(302, '../y?z=1') });
    const r = await inspect('https://a.example/dir/x', fetchHop);
    expect(fetchHop.calls).toEqual(['https://a.example/dir/x', 'https://a.example/y?z=1']);
    expect(r.ok && r.value.hops[0]?.location).toBe('https://a.example/y?z=1');
  });

  it('detects loops on the normalised URL', async () => {
    const fetchHop = server({
      'https://a.example/1': redirect(302, 'https://a.example/2'),
      'https://a.example/2': redirect(302, 'https://A.EXAMPLE:443/1#frag'),
    });
    const r = await inspect('https://a.example/1', fetchHop);
    expect(r).toMatchObject({ ok: true, value: { stopReason: 'loop' } });
    expect(r.ok && r.value.hops).toHaveLength(2);
  });

  it(`stops at ${MAX_HOPS} redirects with max-hops`, async () => {
    const map: Record<string, HopResponse> = {};
    for (let i = 0; i < 40; i++)
      map[`https://a.example/${i}`] = redirect(301, `https://a.example/${i + 1}`);
    const r = await inspect('https://a.example/0', server(map));
    expect(MAX_HOPS).toBe(20);
    expect(r).toMatchObject({ ok: true, value: { stopReason: 'max-hops' } });
    expect(r.ok && r.value.hops).toHaveLength(21);
  });

  it('flags https downgrades and changes of registrable domain', async () => {
    const r = await inspect(
      'https://a.example/',
      server({
        'https://a.example/': redirect(301, 'https://www.a.example/'),
        'https://www.a.example/': redirect(302, 'http://b.example/'),
      }),
    );
    expect(r.ok && r.value.hops.map((h) => h.flags)).toEqual([
      [],
      ['https-downgrade', 'domain-change'],
      [],
    ]);
  });

  it('follows meta refresh and literal JS redirects, and reports non-literal ones without following', async () => {
    const fetchHop = server({
      'https://a.example/': page('<meta http-equiv="refresh" content="0;url=/js">'),
      'https://a.example/js': page('<script>location.href="https://b.example/dyn"</script>'),
      'https://b.example/dyn': page('<script>location = next;</script>'),
    });
    const r = await inspect('https://a.example/', fetchHop);
    expect(r.ok && r.value.hops.map((h) => [h.type, h.location])).toEqual([
      ['meta-refresh', 'https://a.example/js'],
      ['javascript', 'https://b.example/dyn'],
      ['javascript', null],
    ]);
    expect(r).toMatchObject({
      ok: true,
      value: { stopReason: 'final', final: 'https://b.example/dyn' },
    });
  });

  describe('interstitial exit pages (FR-037)', () => {
    const destination =
      'https://jobs.example/oferta-1?utm_source=linkedin&utm_medium=xml&utm_campaign=x';
    const exitPage = `https://social.example/safety/go/?url=${encodeURIComponent(destination)}&urlhash=WoOE`;
    const exitHtml = (href: string) =>
      `<html><a href="/home">Inicio</a><a class="continue" href="${href}">Continuar</a></html>`;

    it('follows the link that matches the destination named in a query parameter', async () => {
      const fetchHop = server({
        [exitPage]: page(exitHtml(destination.replaceAll('&', '&amp;'))),
        [destination]: page(null, 410),
      });
      const r = await inspect(exitPage, fetchHop);
      expect(fetchHop.calls).toEqual([exitPage, destination]);
      expect(r).toMatchObject({ ok: true, value: { stopReason: 'final', final: destination } });
      expect(r.ok && r.value.hops.map((h) => [h.status, h.type, h.location, h.flags])).toEqual([
        [200, 'interstitial', destination, ['domain-change']],
        [410, 'final', null, []],
      ]);
    });

    it('does not follow links that no query parameter names', async () => {
      const fetchHop = server({ [exitPage]: page(exitHtml('https://other.example/')) });
      const r = await inspect(exitPage, fetchHop);
      expect(fetchHop.calls).toEqual([exitPage]);
      expect(r).toMatchObject({
        ok: true,
        value: { stopReason: 'final', final: exitPage, hops: [{ type: 'final' }] },
      });
    });

    it('does not follow a parameter URL the page does not link to', async () => {
      const fetchHop = server({ [exitPage]: page('<p>Sin enlace de salida</p>') });
      const r = await inspect(exitPage, fetchHop);
      expect(fetchHop.calls).toEqual([exitPage]);
      expect(r.ok && r.value.hops[0]?.type).toBe('final');
    });

    it('lets meta refresh take precedence over an interstitial link', async () => {
      const fetchHop = server({
        [exitPage]: page(
          `<meta http-equiv="refresh" content="0;url=https://meta.example/">${exitHtml(destination)}`,
        ),
      });
      const r = await inspect(exitPage, fetchHop);
      expect(r.ok && r.value.hops[0]?.type).toBe('meta-refresh');
    });

    it('detects only absolute http(s) links that match after decoding', () => {
      const href = (h: string) => `<a href='${h}'>x</a>`;
      expect(findInterstitialLink(exitPage, exitHtml(destination.replaceAll('&', '&amp;')))).toBe(
        destination,
      );
      expect(findInterstitialLink(exitPage, href(destination))).toBe(destination);
      expect(
        findInterstitialLink(
          'https://a.example/?to=javascript%3Aalert(1)',
          href('javascript:alert(1)'),
        ),
      ).toBeNull();
      expect(findInterstitialLink('https://a.example/?to=%2Fx', href('/x'))).toBeNull();
      expect(findInterstitialLink('https://a.example/', href('https://b.example/'))).toBeNull();
      expect(findInterstitialLink(exitPage, null)).toBeNull();
    });
  });

  it('reports 4xx and 5xx as the final hop', async () => {
    const r = await inspect(
      'https://a.example/',
      server({ 'https://a.example/': page(null, 404) }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: {
        stopReason: 'final',
        final: 'https://a.example/',
        hops: [{ status: 404, type: 'final' }],
      },
    });
  });

  it('reports blocks, timeouts and TLS errors through stopReason, not as errors', async () => {
    const blocked = await inspect(
      'https://a.example/',
      server({
        'https://a.example/': redirect(302, 'http://169.254.169.254/'),
        'http://169.254.169.254/': {
          kind: 'blocked',
          code: 'inspect.blocked.private-address',
          durationMs: 0,
        },
      }),
    );
    expect(blocked).toMatchObject({
      ok: true,
      value: { stopReason: 'blocked', final: 'https://a.example/' },
    });
    expect(blocked.ok && blocked.value.hops[1]).toMatchObject({
      status: null,
      error: { code: 'inspect.blocked.private-address' },
    });

    const timeout = await inspect(
      'https://a.example/',
      server({
        'https://a.example/': { kind: 'error', code: 'inspect.timeout', durationMs: 5000 },
      }),
    );
    expect(timeout).toMatchObject({ ok: true, value: { stopReason: 'timeout', final: null } });

    const tls = await inspect(
      'https://a.example/',
      server({ 'https://a.example/': { kind: 'error', code: 'inspect.tls', durationMs: 3 } }),
    );
    expect(tls).toMatchObject({
      ok: true,
      value: { stopReason: 'error', hops: [{ error: { code: 'inspect.tls' } }] },
    });
  });

  it('stops with an error when Location is not a valid URL', async () => {
    const r = await inspect(
      'https://a.example/',
      server({ 'https://a.example/': redirect(302, 'http://[::1') }),
    );
    expect(r).toMatchObject({ ok: true, value: { stopReason: 'error' } });
    expect(r.ok && r.value.hops[0]?.error?.code).toBe('inspect.invalid-location');
  });

  it('rejects inputs that are not http(s) before any request', async () => {
    const fetchHop = server({});
    expect(await inspect('ftp://a.example/', fetchHop)).toMatchObject({
      ok: false,
      error: { code: 'url.unsupported-scheme' },
    });
    expect(fetchHop.calls).toEqual([]);
  });

  it('is registered as a server tool that never auto-runs from a shared link', () => {
    expect(inspectTool.runsOn).toBe('server');
    expect(inspectTool.share.decode('#u=https%3A%2F%2Fa.example')).toEqual({
      url: 'https://a.example',
    });
  });
});
