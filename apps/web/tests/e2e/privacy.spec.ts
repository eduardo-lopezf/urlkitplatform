import { expect, expectNoUrlLeak, fill, test } from './fixtures.ts';

const PAGES = [
  '/es/',
  '/es/clean',
  '/es/parse',
  '/es/inspect',
  '/es/diff',
  '/es/explain',
  '/es/headers',
  '/es/metadata',
  '/es/tls',
  '/es/dns',
  '/es/security',
  '/es/about',
  '/es/api',
  '/en/',
];

test('no page sets cookies or loads third-party resources', async ({
  page,
  context,
  requests,
  baseURL,
}) => {
  for (const path of PAGES) await page.goto(path);
  expect(await context.cookies()).toEqual([]);
  const thirdParty = requests.filter(
    (r) => !r.url().startsWith(baseURL ?? '') && !r.url().includes('/v1/metrics/events'),
  );
  expect(thirdParty.map((r) => r.url())).toEqual([]);
});

test('local tools send nothing but the anonymous metrics event', async ({
  page,
  requests,
  baseURL,
}) => {
  const secret = 'privado-123';
  await page.goto('/es/clean');
  await fill(page, 'URL', `https://ejemplo.com/${secret}?utm_source=x`);
  await page.goto('/es/parse');
  await fill(page, 'URL', `https://ejemplo.com/${secret}`);
  await page.goto('/es/explain');
  await fill(page, 'URL', `https://ejemplo.com/${secret}`);
  await page.goto('/es/diff');
  await fill(page, 'Primera URL', `https://ejemplo.com/${secret}`);
  await fill(page, 'Segunda URL', 'https://ejemplo.com/');
  await page.waitForTimeout(2000);
  expectNoUrlLeak(requests, baseURL ?? '', secret);
  for (const r of requests.filter((x) => x.url().includes('/v1/metrics/events'))) {
    expect(Object.keys(JSON.parse(r.postData() ?? '{}')).sort()).toEqual(['outcome', 'tool']);
  }
});

test('the web never sends an Authorization header (003, FR-014)', async ({ page, requests }) => {
  // Network tools answer from a stub: only the outgoing request matters here.
  await page.route('**/v1/**', (route) =>
    route.fulfill({
      status: 429,
      json: { code: 'quota.exceeded', message: { code: 'quota.exceeded' }, retryAfterSeconds: 60 },
    }),
  );
  for (const path of PAGES) await page.goto(path);
  await page.goto('/es/inspect');
  await fill(page, 'URL', 'https://ejemplo.com/');
  await page.getByRole('button', { name: 'Inspeccionar' }).click();
  await page.goto('/es/headers');
  await fill(page, 'URL', 'https://ejemplo.com/');
  await page.getByRole('button', { name: 'Analizar' }).click();
  await page.waitForTimeout(500);
  expect(requests.some((r) => r.url().includes('/v1/inspect'))).toBe(true);
  for (const r of requests) expect(await r.headerValue('authorization'), r.url()).toBeNull();
});

test('every page carries a strict CSP and no referrer', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    const csp = await page
      .locator('meta[http-equiv="content-security-policy"]')
      .getAttribute('content');
    expect(csp, path).toContain("default-src 'self'");
    expect(csp, path).not.toContain('unsafe-inline');
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  }
});

// 002/T091: each network analysis makes exactly one request, a POST to the API with the input in
// the body. Nothing goes to third parties, not even the preview image or the icons of Metadata.
test('network tools make one POST each, with the input only in the body', async ({
  page,
  context,
  requests,
  baseURL,
}) => {
  const secret = 'privado-456';
  const url = `https://ejemplo.com/${secret}`;
  const image = 'https://cdn.third-party.example/og.png';
  await page.route('**/v1/metadata', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        input: url,
        finalUrl: url,
        hops: 0,
        stopReason: 'final',
        contentType: 'text/html',
        truncated: false,
        sources: {
          basic: {},
          openGraph: { image: [image] },
          twitter: {},
          links: { icon: [image] },
        },
        effective: { image: { value: image, from: 'openGraph' } },
        warnings: [],
        catalogVersion: '1.3.0',
      }),
    }),
  );
  for (const tool of ['headers', 'tls', 'dns', 'security'])
    await page.route(`**/v1/${tool}`, (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ code: 'url.invalid', message: { code: 'url.invalid' } }),
      }),
    );
  const runs: Array<[string, string, string]> = [
    ['/es/headers', 'URL', 'Analizar'],
    ['/es/metadata', 'URL', 'Analizar'],
    ['/es/tls', 'Sitio', 'Analizar'],
    ['/es/dns', 'Dominio', 'Consultar'],
    ['/es/security', 'URL', 'Analizar'],
  ];
  for (const [path, label, button] of runs) {
    await page.goto(path);
    await fill(page, label, url);
    await page.getByRole('button', { name: button }).click();
    await page.waitForTimeout(300);
  }
  const api = requests.filter((r) => /\/v1\/(headers|metadata|tls|dns|security)$/.test(r.url()));
  expect(api.map((r) => `${r.method()} ${new URL(r.url()).pathname}`)).toEqual([
    'POST /v1/headers',
    'POST /v1/metadata',
    'POST /v1/tls',
    'POST /v1/dns',
    'POST /v1/security',
  ]);
  for (const r of api) expect(r.postData()).toContain(secret);
  for (const r of requests) expect(r.url()).not.toContain(secret);
  const thirdParty = requests.filter(
    (r) => !r.url().startsWith(baseURL ?? '') && !/\/v1\//.test(r.url()),
  );
  expect(thirdParty.map((r) => r.url())).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});
