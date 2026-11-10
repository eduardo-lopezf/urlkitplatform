import { expect, expectNoUrlLeak, fill, test } from './fixtures.ts';

const PAGES = [
  '/es/',
  '/es/clean',
  '/es/parse',
  '/es/inspect',
  '/es/diff',
  '/es/explain',
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
