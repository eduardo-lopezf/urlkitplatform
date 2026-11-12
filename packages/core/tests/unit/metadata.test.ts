/** Metadata: extraction and effective preview values from a synthetic document (002/T037). */
import { describe, expect, it } from 'vitest';
import {
  extractMetadata,
  metadataTool,
  type ChainObservation,
  type MetadataCriteria,
  type PageMetadata,
} from '../../src/index.ts';
import { parseHtml } from '../../src/tools/metadata/html.ts';
import { catalog } from '../fixtures/catalog.ts';

const PRECEDENCE: MetadataCriteria['precedence'] = {
  title: ['openGraph', 'twitter', 'basic'],
  description: ['openGraph', 'twitter', 'basic'],
  image: ['openGraph', 'twitter'],
  url: ['openGraph', 'basic'],
  siteName: ['openGraph'],
  type: ['openGraph'],
};
const CATALOG = catalog({ version: '4.5.6-test', metadata: { precedence: PRECEDENCE } });
const FINAL = 'https://www.example.com/blog/post?id=1';

function observe(
  html: string,
  extra: { contentType?: string; truncated?: boolean; final?: string } = {},
): ChainObservation {
  const final = extra.final ?? FINAL;
  return {
    chain: {
      input: final,
      hops: [
        {
          index: 0,
          url: final,
          status: 200,
          type: 'final',
          location: null,
          durationMs: 1,
          flags: [],
        },
      ],
      final,
      stopReason: 'final',
      totalMs: 1,
    },
    finalResponse: {
      status: 200,
      rawHeaders: [],
      contentType: extra.contentType ?? 'text/html; charset=utf-8',
      body: new TextEncoder().encode(html),
      bodyTruncated: extra.truncated ?? false,
    },
  };
}

const run = (html: string, extra?: Parameters<typeof observe>[1], c = CATALOG) =>
  extractMetadata(observe(html, extra), c, parseHtml);
const codes = (r: PageMetadata) => r.warnings.map((w) => w.code);

const FULL = `<!doctype html><html lang="es"><head>
<title>Título básico</title>
<meta name="description" content="Descripción básica">
<meta property="og:title" content="Título OG">
<meta property="og:description" content="Descripción OG">
<meta property="og:image" content="https://cdn.example.com/a.png">
<meta property="og:image" content="https://cdn.example.com/b.png">
<meta property="og:site_name" content="Ejemplo">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Título Twitter">
<link rel="canonical" href="/blog/post">
<link rel="icon" href="/favicon.ico">
<link rel="alternate" hreflang="en" href="https://www.example.com/en/blog/post">
</head><body><p>hola</p></body></html>`;

describe('extraction', () => {
  it('groups values by source, keeping repeated og:image', () => {
    const r = run(FULL);
    expect(r.sources).toEqual({
      basic: { title: 'Título básico', description: 'Descripción básica' },
      openGraph: {
        title: ['Título OG'],
        description: ['Descripción OG'],
        image: ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png'],
        site_name: ['Ejemplo'],
        type: ['article'],
      },
      twitter: { card: ['summary_large_image'], title: ['Título Twitter'] },
      links: {
        canonical: 'https://www.example.com/blog/post',
        icon: ['https://www.example.com/favicon.ico'],
        alternate: [{ hreflang: 'en', href: 'https://www.example.com/en/blog/post' }],
      },
      lang: 'es',
    });
  });

  it('finds a <meta> placed after <body>, as the HTML standard does', () => {
    const r = run(
      '<title>x</title><body><p>a</p><meta property="og:title" content="Tarde"></body>',
    );
    expect(r.sources.openGraph.title).toEqual(['Tarde']);
  });

  it('resolves relative URLs against the final URL and honours <base href>', () => {
    const r = run(
      '<base href="https://static.example.com/x/"><meta property="og:image" content="img.png">',
    );
    expect(r.effective.image).toEqual({
      value: 'https://static.example.com/x/img.png',
      from: 'openGraph',
    });
  });
});

describe('effective values', () => {
  it('follow the injected precedence and record their source', () => {
    const r = run(FULL);
    expect(r.effective).toEqual({
      title: { value: 'Título OG', from: 'openGraph' },
      description: { value: 'Descripción OG', from: 'openGraph' },
      image: { value: 'https://cdn.example.com/a.png', from: 'openGraph' },
      url: { value: 'https://www.example.com/blog/post', from: 'basic' },
      siteName: { value: 'Ejemplo', from: 'openGraph' },
      type: { value: 'article', from: 'openGraph' },
    });
  });

  it('use the next source when the first is absent', () => {
    const r = run(
      '<title>Solo básico</title><meta name="twitter:image" content="https://t.example/i.png">',
    );
    expect(r.effective.title).toEqual({ value: 'Solo básico', from: 'basic' });
    expect(r.effective.image).toEqual({ value: 'https://t.example/i.png', from: 'twitter' });
  });

  it('change with the catalog', () => {
    const basicFirst = catalog({
      metadata: { precedence: { ...PRECEDENCE, title: ['basic', 'openGraph'] } },
    });
    expect(run(FULL, {}, basicFirst).effective.title?.from).toBe('basic');
  });
});

describe('warnings', () => {
  it('missing title, description and image', () => {
    expect(codes(run('<p>nada</p>'))).toEqual([
      'metadata.missing-title',
      'metadata.missing-description',
      'metadata.missing-image',
    ]);
  });

  it('canonical on another registrable domain', () => {
    const r = run('<title>t</title><link rel="canonical" href="https://otro.example.org/p">');
    expect(codes(r)).toContain('metadata.canonical-cross-domain');
    expect(codes(run('<link rel="canonical" href="https://blog.example.com/p">'))).not.toContain(
      'metadata.canonical-cross-domain',
    );
  });

  it('relative og:image', () => {
    expect(codes(run('<meta property="og:image" content="/i.png">'))).toContain(
      'metadata.image-relative',
    );
  });

  it('truncated document', () => {
    expect(codes(run(FULL, { truncated: true }))).toContain('metadata.truncated');
    expect(run(FULL, { truncated: true }).truncated).toBe(true);
  });

  it('non-HTML content', () => {
    const r = run('%PDF-1.7', { contentType: 'application/pdf' });
    expect(r).toMatchObject({
      contentType: 'application/pdf',
      warnings: [{ code: 'metadata.not-html', params: { type: 'application/pdf' } }],
      effective: {},
    });
    expect(r.encoding).toBeUndefined();
  });
});

describe('safety', () => {
  it('never interprets <script> and returns markup and dangerous URLs as plain text', () => {
    const r = run(`<title>&lt;b&gt;negrita&lt;/b&gt;</title>
<script>document.write('<meta property="og:title" content="inyectado">')</script>
<meta property="og:url" content="javascript:alert(1)">
<meta property="og:image" content="data:image/png;base64,AAAA">`);
    expect(r.sources.basic.title).toBe('<b>negrita</b>');
    expect(r.sources.openGraph.title).toBeUndefined();
    expect(r.effective.url?.value).toBe('javascript:alert(1)');
    expect(r.effective.image?.value).toBe('data:image/png;base64,AAAA');
  });
});

describe('chain and determinism', () => {
  it('reports the hop error when the chain did not end on a response', () => {
    const obs = observe('');
    obs.chain.stopReason = 'timeout';
    obs.chain.final = null;
    obs.chain.hops[0] = { ...obs.chain.hops[0]!, status: null, error: { code: 'inspect.timeout' } };
    const r = extractMetadata({ ...obs, finalResponse: null }, CATALOG, parseHtml);
    expect(r).toMatchObject({
      finalUrl: null,
      stopReason: 'timeout',
      error: { code: 'inspect.timeout' },
    });
    expect(r.warnings).toEqual([]);
  });

  it('gives the same result twice and echoes catalogVersion and the encoding', () => {
    const a = run(FULL);
    expect(run(FULL)).toEqual(a);
    expect(a.catalogVersion).toBe('4.5.6-test');
    expect(a.encoding).toEqual({ label: 'utf-8', source: 'header' });
  });
});

describe('metadataTool', () => {
  it('asks the chain for the HTML body and needs the injected parser', async () => {
    const calls: string[] = [];
    const r = await metadataTool.run(
      { url: FINAL },
      {
        catalog: CATALOG,
        parseHtml,
        fetchChain: async (_url, opts) => {
          calls.push(opts.body);
          return { ok: true, value: observe(FULL) };
        },
      },
    );
    expect(calls).toEqual(['html']);
    expect(r).toMatchObject({ ok: true, value: { effective: { title: { value: 'Título OG' } } } });
    expect(metadataTool).toMatchObject({
      id: 'metadata',
      runsOn: 'server',
      sendTo: ['headers', 'inspect', 'clean', 'security'],
    });
  });
});
