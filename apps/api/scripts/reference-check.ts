/**
 * Reference sets of the v2 (002/T096, SC-003 to SC-006), against the real network. Not part of
 * CI: run by hand and record the output.
 *
 *   node apps/api/scripts/reference-check.ts [--out report.md] [--dir <folder>]
 *   node apps/api/scripts/reference-check.ts --score <folder>/sc003-review.csv
 *   node apps/api/scripts/reference-check.ts --score <folder>/sc004-review.csv
 *   node apps/api/scripts/reference-check.ts --timing <api base URL> [--limit <n>]
 *
 * - SC-003 (HTTP Headers): status and header names of the final response, compared with what
 *   `curl` receives for the same URL and User-Agent. For the manual half, every response is saved
 *   as a snapshot (URLkit's and curl's, taken together) and `sc003-review.csv` lists each header
 *   check with URLkit's state and an empty column for the reviewer's.
 * - SC-004 (Metadata): the document URLkit read is saved as a snapshot, and `sc004-review.csv`
 *   lists title, description, image and canonical with URLkit's value and a column for the
 *   expected one. Expected values already in reference-sets.json are compared in the report.
 * - SC-005 (TLS): problems named for the badssl.com hosts.
 * - SC-006 (DNS): DNSSEC state of signed, unsigned and broken domains.
 *
 * `--score` reads a reviewed CSV and prints the agreement and every disagreement.
 *
 * `--timing` (SC-001, 002/T098a) times the five network endpoints of a running API over the
 * SC-003 site list and prints p50, p95 and the share under budget per tool. Unlike the rest, it
 * goes through the API, because SC-001 is the time a visitor waits.
 *
 * Snapshots and CSVs go to `--dir` (default `apps/api/scripts/out/<date>`, ignored by git: they
 * hold third-party pages and headers). It uses the production adapters and core tools directly,
 * without the API or its quotas.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dnsTool, extractMetadata, headersTool, tlsTool } from '@urlkit/core';
import { parseHtml } from '@urlkit/core/html';
import { catalog } from '@urlkit/rules';
import { createSafeFetch, USER_AGENT } from '../src/inspect/safe-fetch.ts';
import { createFetchChain } from '../src/probes/chain.ts';
import { createQueryDns } from '../src/probes/dns/doh.ts';
import { createProbeTls } from '../src/probes/tls/connect.ts';

/** Fields of SC-004. `canonical` is the canonical link, not the effective URL of a preview. */
const META_FIELDS = ['title', 'description', 'image', 'canonical'] as const;
type MetaField = (typeof META_FIELDS)[number];

interface Sets {
  headers: string[];
  metadata: {
    pages: Array<{ url: string; case?: string; expected?: Partial<Record<MetaField, string>> }>;
  };
  tls: Array<{ target: string; expect: { trust?: string; problems: string[] } }>;
  dns: Array<{ target: string; expect: { dnssec?: string; outcome?: string } }>;
}

// ---------------------------------------------------------------- CSV (RFC 4180, UTF-8 + BOM)

const cell = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
/** The BOM lets spreadsheet programs open accents correctly. */
const toCsv = (rows: Array<Array<string | number>>) =>
  '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  // Spreadsheets with a European locale save with semicolons: the header line tells which.
  const header = src.slice(0, src.search(/\r?\n|$/));
  const separator = header.includes(';') && !header.includes(',') ? ';' : ',';
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === separator) endField();
    else if (ch === '\n') endRow();
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) endRow();
  const [head = [], ...body] = rows;
  return body
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

// ---------------------------------------------------------------- --score <csv>

/** "—", "-" or "(none)" in the expected column mean "the page declares nothing". */
const NONE = new Set(['—', '-', '(none)', '(ninguno)']);
const norm = (v: string) => (NONE.has(v.trim()) ? '' : v.replace(/\s+/g, ' ').trim());

function score(file: string): void {
  const rows = parseCsv(readFileSync(file, 'utf8'));
  const sc003 = rows.length > 0 && 'reviewer_state' in (rows[0] ?? {});
  const judged = rows.filter((r) => (sc003 ? r.reviewer_state : r.expected) !== '');
  const wrong = judged.filter((r) =>
    sc003
      ? r.reviewer_state?.toLowerCase() !== r.urlkit_state?.toLowerCase()
      : norm(r.expected ?? '') !== norm(r.urlkit_value ?? ''),
  );
  const ok = judged.length - wrong.length;
  const pct = judged.length ? Math.round((ok / judged.length) * 1000) / 10 : 0;
  const out = [
    `${sc003 ? 'SC-003, evaluación de cabeceras' : 'SC-004, metadatos'}: ${ok}/${judged.length} (${pct} %) · objetivo ≥ 95 %`,
    `Filas sin revisar: ${rows.length - judged.length}`,
    ...(wrong.length ? ['', 'Desacuerdos:'] : []),
    ...wrong.map((r) =>
      sc003
        ? `- ${r.site} · ${r.check}: URLkit «${r.urlkit_state}», revisión «${r.reviewer_state}»${r.notes ? ` (${r.notes})` : ''}`
        : `- ${r.url} · ${r.field}: URLkit «${r.urlkit_value}», esperado «${r.expected}»${r.notes ? ` (${r.notes})` : ''}`,
    ),
  ];
  process.stdout.write(out.join('\n') + '\n');
}

const scoreArg = process.argv.indexOf('--score');
if (scoreArg !== -1) {
  const file = process.argv[scoreArg + 1];
  if (!file) throw new Error('--score needs the path of a reviewed CSV');
  score(file);
  process.exit(0);
}

// ---------------------------------------------------------------- --timing <api> (SC-001)

/** SC-001 budgets per endpoint, in milliseconds. */
const BUDGETS = { headers: 5000, metadata: 5000, tls: 5000, dns: 5000, security: 10_000 } as const;

const percentile = (sorted: number[], p: number) =>
  sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? 0;
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

/**
 * Times each analysis end to end through the API (request sent, whole response read), one at a
 * time, over the SC-003 site list. An error response (the tool could not analyse the target)
 * is a measurement, counted in its column too; a 429 or a failed connection is not, and is
 * counted apart. Each request carries a different documentation-range client IP, so a local API
 * started with TRUST_PROXY=1 does not stop the run at 10 per hour; behind Caddy that header is
 * replaced and the quota applies (use `--limit`).
 */
async function timing(base: string, limit: number): Promise<string> {
  const { headers: sites } = JSON.parse(
    readFileSync(new URL('./reference-sets.json', import.meta.url), 'utf8'),
  ) as Sets;
  const targets = sites.slice(0, limit);
  const rows: string[] = [];
  const slowest: string[] = [];
  let n = 0;
  for (const [tool, budget] of Object.entries(BUDGETS)) {
    const samples: Array<{ url: string; ms: number }> = [];
    let refused = 0;
    let errors = 0;
    for (const url of targets) {
      n++;
      const body = tool === 'tls' || tool === 'dns' ? { target: url } : { url };
      const t0 = performance.now();
      try {
        const res = await fetch(`${base}/v1/${tool}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': `198.51.100.${(n % 254) + 1}`,
          },
          body: JSON.stringify(body),
        });
        await res.arrayBuffer();
        if (res.status === 429) refused++;
        else {
          samples.push({ url, ms: performance.now() - t0 });
          if (res.status !== 200) errors++;
        }
      } catch {
        refused++;
      }
    }
    const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
    const within = sorted.filter((ms) => ms < budget).length;
    const pct = sorted.length ? Math.round((within / sorted.length) * 1000) / 10 : 0;
    rows.push(
      `| ${tool} | ${sorted.length} | ${seconds(percentile(sorted, 0.5))} | ${seconds(percentile(sorted, 0.95))} | ${seconds(sorted.at(-1) ?? 0)} | ${within}/${sorted.length} (${pct} %) | < ${budget / 1000} s | ${pct >= 95 ? '✅' : '❌'} | ${errors} | ${refused} |`,
    );
    for (const s of [...samples].sort((a, b) => b.ms - a.ms).slice(0, 3)) {
      slowest.push(`| ${tool} | \`${s.url}\` | ${seconds(s.ms)} |`);
    }
  }
  return [
    `**Fecha**: ${new Date().toISOString()} · **API**: \`${base}\` · **Node**: ${process.version}`,
    '',
    '| Herramienta | Muestras | p50 | p95 | Máximo | Por debajo del objetivo | Objetivo | ≥ 95 % | De ellas, error | 429 o sin conexión |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    'Las tres más lentas de cada herramienta:',
    '',
    '| Herramienta | URL | Tiempo |',
    '| --- | --- | --- |',
    ...slowest,
  ].join('\n');
}

const timingArg = process.argv.indexOf('--timing');
if (timingArg !== -1) {
  const base = process.argv[timingArg + 1]?.replace(/\/$/, '');
  if (!base) throw new Error('--timing needs the base URL of the API, e.g. http://localhost:8788');
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : Infinity;
  process.stdout.write((await timing(base, limit)) + '\n');
  process.exit(0);
}

// ---------------------------------------------------------------- snapshots

const started = new Date();
const dirArg = process.argv.indexOf('--dir');
const DIR =
  (dirArg !== -1 && process.argv[dirArg + 1]) ||
  join(import.meta.dirname, 'out', started.toISOString().slice(0, 10));
mkdirSync(join(DIR, 'headers'), { recursive: true });
mkdirSync(join(DIR, 'metadata'), { recursive: true });

/** File name for a URL: host and path, nothing else. */
const slug = (url: string) => {
  const u = new URL(url);
  return `${u.hostname}${u.pathname}`.replace(/[^a-z0-9.-]+/gi, '_').replace(/_+$/, '') || 'root';
};
/**
 * Cookie values are never stored, in our snapshots either (Principio V). The name and the
 * attributes are kept: they are what the SC-003 review judges.
 */
const omitCookie = (line: string) =>
  // Without "=", what comes before ";" is the value (RFC 6265bis), so it is omitted too.
  line.replace(
    /^(set-cookie\s*:\s*)(?:([^=;]*)=)?[^;]*/i,
    (_m, head: string, name: string | undefined) => `${head}${(name ?? '').trim()}=<omitido>`,
  );

const sets = JSON.parse(
  readFileSync(new URL('./reference-sets.json', import.meta.url), 'utf8'),
) as Sets;
const fetchChain = createFetchChain({ safeFetch: createSafeFetch() });
const probeTls = createProbeTls();
const queryDns = createQueryDns();

/** Headers that legitimately differ between two requests a second apart. */
const VOLATILE =
  /^(date|age|expires|set-cookie|etag|last-modified|x-request-id|x-amz-|x-cache|cf-ray|report-to|nel|server-timing|x-served-by|x-timer|via|alt-svc|content-length|x-fastly|akamai|x-akamai|x-trace|traceparent|x-envoy|x-runtime)/i;

/** Final status and headers as curl sees them (GET, same User-Agent, following redirects). */
function curl(url: string): { status: number; names: Set<string>; raw: string[] } | null {
  try {
    const out = execFileSync(
      'curl',
      [
        '-s',
        '-L',
        '--max-redirs',
        '20',
        '-m',
        '15',
        '-o',
        '/dev/null',
        '-D',
        '-',
        '-A',
        USER_AGENT,
        url,
      ],
      { encoding: 'latin1' },
    );
    const blocks = out.split(/\r?\n\r?\n/).filter((b) => /^HTTP\//.test(b.trim()));
    const last = blocks.at(-1)?.trim().split(/\r?\n/) ?? [];
    const status = Number(/^HTTP\/[\d.]+ (\d{3})/.exec(last[0] ?? '')?.[1]);
    const names = new Set(last.slice(1).map((l) => l.split(':')[0]?.trim().toLowerCase() ?? ''));
    return Number.isFinite(status) ? { status, names, raw: last.map(omitCookie) } : null;
  } catch {
    return null;
  }
}

const lines: string[] = [];
const row = (...cells: Array<string | number>) => lines.push(`| ${cells.join(' | ')} |`);
const rate = (ok: number, total: number) =>
  total === 0 ? 'n/a' : `${ok}/${total} (${Math.round((ok / total) * 100)} %)`;

async function headers(): Promise<string> {
  lines.push('## SC-003 — HTTP Headers frente a curl', '');
  row('URL', 'Estado (URLkit / curl)', 'Cabeceras comunes', 'Resultado');
  row('---', '---', '---', '---');
  let ok = 0;
  let total = 0;
  const review: Array<Array<string | number>> = [
    ['site', 'check', 'urlkit_state', 'urlkit_findings', 'reviewer_state', 'notes'],
  ];
  for (const url of sets.headers) {
    const ours = await headersTool.run({ url }, { fetchChain, catalog });
    const theirs = curl(url);
    // Both snapshots are taken together, so the reviewer judges what URLkit judged.
    const name = slug(url);
    if (ours.ok) {
      const v = ours.value;
      writeFileSync(
        join(DIR, 'headers', `${name}.urlkit.txt`),
        [
          `# ${url} → ${v.finalUrl ?? v.error?.code ?? v.stopReason} · ${started.toISOString()}`,
          `HTTP ${v.status ?? '—'}`,
          ...v.headers.map((h) => `${h.name}: ${h.value}`),
        ].join('\n') + '\n',
      );
      for (const check of v.security)
        review.push([
          url,
          check.header,
          check.state,
          check.findings.map((f) => f.code).join(' '),
          '',
          '',
        ]);
      for (const c of v.cookies)
        review.push([
          url,
          `cookie:${c.name}`,
          c.findings.length ? 'issues' : 'ok',
          c.findings.map((f) => f.code).join(' '),
          '',
          '',
        ]);
    }
    if (theirs)
      writeFileSync(join(DIR, 'headers', `${name}.curl.txt`), theirs.raw.join('\n') + '\n');
    if (!ours.ok || !theirs || ours.value.status === null) {
      row(
        url,
        `${ours.ok ? (ours.value.error?.code ?? ours.value.status) : ours.error.code} / ${theirs?.status ?? 'error'}`,
        '—',
        'no comparable',
      );
      continue;
    }
    total++;
    const mine = new Set(ours.value.headers.map((h) => h.name.toLowerCase()));
    const stable = (s: Set<string>) => [...s].filter((n) => n && !VOLATILE.test(n));
    const a = stable(mine);
    const b = new Set(stable(theirs.names));
    const shared = a.filter((n) => b.has(n)).length;
    const overlap = Math.max(a.length, b.size) === 0 ? 1 : shared / Math.max(a.length, b.size);
    const pass = ours.value.status === theirs.status && overlap >= 0.9;
    if (pass) ok++;
    row(
      url,
      `${ours.value.status} / ${theirs.status}`,
      `${Math.round(overlap * 100)} %`,
      pass ? 'coincide' : 'difiere',
    );
  }
  lines.push('', `Coinciden: **${rate(ok, total)}** de los comparables (objetivo: 100 %).`, '');
  writeFileSync(join(DIR, 'sc003-review.csv'), toCsv(review));
  return rate(ok, total);
}

async function metadata(): Promise<string> {
  lines.push('## SC-004 — Metadata', '');
  const review: Array<Array<string | number>> = [
    ['url', 'case', 'field', 'fetch', 'urlkit_value', 'urlkit_source', 'expected', 'notes'],
  ];
  let ok = 0;
  let total = 0;
  for (const { url, case: kind = '', expected = {} } of sets.metadata.pages) {
    const observed = await fetchChain(url, { body: 'html' });
    const name = slug(url);
    if (!observed.ok) {
      lines.push(`- ${url}: ${observed.error.code}`);
      continue;
    }
    // The exact bytes URLkit read: the reviewer fills `expected` from this file.
    const body = observed.value.finalResponse?.body;
    if (body) writeFileSync(join(DIR, 'metadata', `${name}.html`), body);
    const meta = extractMetadata(observed.value, catalog, parseHtml);
    // What the request gave, so an empty value is not mistaken for "the page declares nothing".
    const status = observed.value.finalResponse?.status;
    const fetched = meta.error
      ? meta.error.code
      : meta.warnings.some((w) => w.code === 'metadata.not-html')
        ? `${status} ${meta.contentType ?? ''}`.trim()
        : status && status >= 200 && status < 300
          ? String(status)
          : `${status ?? '—'} (sin documento)`;
    writeFileSync(
      join(DIR, 'metadata', `${name}.urlkit.json`),
      JSON.stringify(meta, null, 2) + '\n',
    );
    for (const field of META_FIELDS) {
      const got =
        field === 'canonical'
          ? {
              value: meta.sources.links.canonical ?? '',
              from: meta.sources.links.canonical ? 'link' : '',
            }
          : (meta.effective[field] ?? { value: '', from: '' });
      const want = expected[field];
      review.push([url, kind, field, fetched, got.value, got.from, want ?? '', '']);
      if (want === undefined) continue;
      total++;
      if (norm(want) === norm(got.value)) ok++;
      else lines.push(`- ${url} · ${field}: esperado «${want}», obtenido «${got.value || '—'}»`);
    }
  }
  writeFileSync(join(DIR, 'sc004-review.csv'), toCsv(review));
  if (sets.metadata.pages.length === 0) {
    lines.push(
      'Pendiente: no hay páginas en `apps/api/scripts/reference-sets.json` (`metadata.pages`).',
      '',
    );
    return 'pendiente';
  }
  if (total === 0) {
    lines.push(
      `Pendiente: ${sets.metadata.pages.length} páginas sin valores esperados. Rellena la columna \`expected\` de \`sc004-review.csv\` y puntúa con \`--score\`.`,
      '',
    );
    return 'pendiente de revisión';
  }
  lines.push('', `Correctos: **${rate(ok, total)}** (objetivo: ≥ 95 %).`, '');
  return rate(ok, total);
}

async function tls(): Promise<string> {
  lines.push('## SC-005 — TLS con badssl.com', '');
  row('Host', 'Esperado', 'Obtenido', 'Resultado');
  row('---', '---', '---', '---');
  let ok = 0;
  for (const { target, expect } of sets.tls) {
    const r = await tlsTool.run({ target }, { probeTls, catalog });
    const got = r.ok ? r.value.problems.map((p) => p.code) : [r.error.code];
    const trust = r.ok ? r.value.trust : undefined;
    const pass =
      expect.problems.every((p) => got.includes(p)) &&
      (expect.problems.length > 0 || got.length === 0) &&
      (expect.trust === undefined || expect.trust === trust);
    if (pass) ok++;
    const error = r.ok ? (r.value.error?.code ?? r.value.blocked?.code) : undefined;
    row(
      target,
      expect.problems.join(', ') || expect.trust || '—',
      error ?? (got.join(', ') || trust || '—'),
      pass ? 'correcto' : 'falla',
    );
  }
  lines.push('', `Detectados: **${rate(ok, sets.tls.length)}** (objetivo: 100 %).`, '');
  return rate(ok, sets.tls.length);
}

async function dns(): Promise<string> {
  lines.push('## SC-006 — Estado DNSSEC', '');
  row('Dominio', 'Esperado', 'Obtenido', 'Resolutor', 'Resultado');
  row('---', '---', '---', '---', '---');
  let ok = 0;
  for (const { target, expect } of sets.dns) {
    const r = await dnsTool.run({ target, scope: 'host' }, { queryDns });
    const got = r.ok
      ? { dnssec: r.value.dnssec, outcome: r.value.outcome }
      : { error: r.error.code };
    const pass =
      r.ok &&
      (expect.dnssec === undefined || expect.dnssec === r.value.dnssec) &&
      (expect.outcome === undefined || expect.outcome === r.value.outcome);
    if (pass) ok++;
    row(
      target,
      JSON.stringify(expect),
      JSON.stringify(got),
      r.ok ? r.value.resolver : '—',
      pass ? 'correcto' : 'falla',
    );
  }
  lines.push('', `Correctos: **${rate(ok, sets.dns.length)}** (objetivo: 100 %).`, '');
  return rate(ok, sets.dns.length);
}

const results = {
  headers: await headers(),
  metadata: await metadata(),
  tls: await tls(),
  dns: await dns(),
};
const header = [
  '# Validación: conjuntos de referencia (002/T096)',
  '',
  `**Fecha**: ${started.toISOString()} · **Catálogo**: ${catalog.version} · **Node**: ${process.version}`,
  '',
  'Ejecutado con `node apps/api/scripts/reference-check.ts`, contra la red real, desde la máquina de desarrollo. Usa los adaptadores de producción y las herramientas del núcleo, sin la API ni sus cuotas.',
  '',
  '| Criterio | Resultado |',
  '| --- | --- |',
  `| SC-003 HTTP Headers (estado y cabeceras frente a curl) | ${results.headers} |`,
  '| SC-003 evaluación de cabeceras frente a revisión manual | pendiente: `sc003-review.csv` y `--score` |',
  `| SC-004 Metadata | ${results.metadata} |`,
  `| SC-005 TLS | ${results.tls} |`,
  `| SC-006 DNSSEC | ${results.dns} |`,
  '',
];
const report = [...header, ...lines].join('\n');
const out = process.argv.indexOf('--out');
if (out !== -1 && process.argv[out + 1]) writeFileSync(process.argv[out + 1]!, report + '\n');
process.stdout.write(report + '\n');
process.stderr.write(`Instantáneas y CSV en ${DIR}\n`);
