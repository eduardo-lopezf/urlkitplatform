import { expect, expectAccessible, fill, test } from './fixtures.ts';

const URL_IN = 'https://example.com/post?ref=secret-ref';
const IMAGE = 'https://cdn.third-party.example/og-image.png';
const ICON = 'https://cdn.third-party.example/favicon.ico';

const METADATA = {
  input: URL_IN,
  finalUrl: URL_IN,
  hops: 0,
  stopReason: 'final',
  contentType: 'text/html; charset=utf-8',
  encoding: { label: 'utf-8', source: 'header' },
  truncated: false,
  sources: {
    basic: { title: 'Título básico', description: 'Descripción básica' },
    openGraph: { title: ['Título OG'], image: [IMAGE], site_name: ['Ejemplo'] },
    twitter: { card: ['summary'] },
    links: { canonical: 'https://example.com/post', icon: [ICON] },
    lang: 'es',
  },
  effective: {
    title: { value: 'Título OG', from: 'openGraph' },
    description: { value: 'Descripción básica', from: 'basic' },
    image: { value: IMAGE, from: 'openGraph' },
    siteName: { value: 'Ejemplo', from: 'openGraph' },
  },
  warnings: [],
  catalogVersion: '1.3.0',
};

const CORS = { 'Access-Control-Allow-Origin': '*' };

test('shows the effective preview and the sources, never loading third-party images', async ({
  page,
  requests,
}) => {
  await page.route('**/v1/metadata', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(METADATA),
    }),
  );
  await page.goto('/es/metadata');
  await fill(page, 'URL', URL_IN);
  await page.getByRole('button', { name: 'Analizar' }).click();
  await expect(page.getByText('Título OG').first()).toBeVisible();
  await expect(page.getByText('Descripción básica').first()).toBeVisible();
  await expect(page.getByText(IMAGE).first()).toBeVisible();
  await expect(page.getByText('og:title')).toBeVisible();
  // No <img> or <link> points at the image or the icon, and nothing was requested from them.
  expect(
    await page.locator(`img[src="${IMAGE}"], link[href="${ICON}"], img[src="${ICON}"]`).count(),
  ).toBe(0);
  for (const r of requests) expect(r.url()).not.toContain('third-party');
  for (const r of requests) expect(r.url()).not.toContain('secret-ref');
  await expectAccessible(page);
});

test('copies the effective title', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/v1/metadata', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(METADATA),
    }),
  );
  await page.goto('/es/metadata');
  await fill(page, 'URL', URL_IN);
  await page.getByRole('button', { name: 'Analizar' }).click();
  await page.getByRole('button', { name: 'Copiar título' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Título OG');
});

test('shows the warnings and the truncation notice', async ({ page }) => {
  await page.route('**/v1/metadata', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({
        ...METADATA,
        truncated: true,
        effective: {},
        warnings: [{ code: 'metadata.missing-image' }, { code: 'metadata.truncated' }],
      }),
    }),
  );
  await page.goto('/es/metadata');
  await fill(page, 'URL', URL_IN);
  await page.getByRole('button', { name: 'Analizar' }).click();
  await expect(page.getByRole('heading', { name: 'Avisos' })).toBeVisible();
  await expect(page.getByText('imagen de vista previa', { exact: false }).first()).toBeVisible();
  await expectAccessible(page);
});

test('a shared #u= link never calls the API on its own', async ({ page }) => {
  let calls = 0;
  await page.route('**/v1/metadata', (route) => {
    calls++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto(`/es/metadata#u=${encodeURIComponent(URL_IN)}`);
  await expect(page.getByLabel('URL')).toHaveValue(URL_IN);
  await page.waitForTimeout(500);
  expect(calls).toBe(0);
});
