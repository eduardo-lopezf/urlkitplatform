import { expect, expectAccessible, fill, test } from './fixtures.ts';

const set = (records: Array<{ name: string; ttl: number; data: unknown }>) => ({
  state: records.length ? 'ok' : 'empty',
  records,
});

const LONG_TXT = `v=spf1 ${'include:_spf.very-long-provider-name.example.com '.repeat(8)}-all`;

const LOOKUP = {
  input: 'https://www.example.com/x',
  name: { unicode: 'www.example.com', ascii: 'www.example.com' },
  alternative: { unicode: 'example.com', ascii: 'example.com', kind: 'registrable' },
  outcome: 'exists',
  dnssec: 'validated',
  resolver: 'cloudflare',
  records: {
    A: set([{ name: 'www.example.com', ttl: 300, data: '93.184.215.14' }]),
    AAAA: set([]),
    CNAME: set([]),
    MX: set([
      { name: 'www.example.com', ttl: 3600, data: { priority: 10, exchange: 'mx.example.com' } },
    ]),
    NS: set([]),
    TXT: set([{ name: 'www.example.com', ttl: 300, data: LONG_TXT }]),
    CAA: set([]),
    SOA: set([]),
  },
  warnings: [],
};

const CORS = { 'Access-Control-Allow-Origin': '*' };

test('shows records by type with TTL, the DNSSEC state and the resolver', async ({ page }) => {
  const bodies: unknown[] = [];
  await page.route('**/v1/dns', (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? '{}'));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(LOOKUP),
    });
  });
  await page.goto('/es/dns');
  await fill(page, 'Dominio', 'https://www.example.com/x');
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByRole('heading', { name: 'A', exact: true })).toBeVisible();
  await expect(page.getByText('93.184.215.14')).toBeVisible();
  await expect(page.getByText('TTL 300 s').first()).toBeVisible();
  await expect(page.getByText('10 mx.example.com')).toBeVisible();
  await expect(page.getByText('Firmado y validado con DNSSEC', { exact: false })).toBeVisible();
  await expect(page.getByText('Respondió Cloudflare', { exact: false })).toBeVisible();
  expect(bodies[0]).toEqual({ target: 'https://www.example.com/x', scope: 'host' });
  // The long TXT wraps: no horizontal scroll, also at 320 px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectAccessible(page);
});

test('the alternative-name action switches scope and the shareable fragment', async ({ page }) => {
  const bodies: Array<{ scope?: string }> = [];
  await page.route('**/v1/dns', (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? '{}'));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(LOOKUP),
    });
  });
  await page.goto('/es/dns');
  await fill(page, 'Dominio', 'www.example.com');
  await page.getByRole('button', { name: 'Consultar' }).click();
  await page.getByRole('button', { name: 'Consultar también example.com' }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]?.scope).toBe('registrable');
  await expect(page).toHaveURL(/#u=www\.example\.com&t=registrable$/);
});

test('nxdomain and failed are visibly different', async ({ page }) => {
  let outcome = 'nxdomain';
  await page.route('**/v1/dns', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({
        ...LOOKUP,
        alternative: null,
        outcome,
        dnssec: outcome === 'failed' ? 'unknown' : 'validated',
        warnings: [{ code: outcome === 'failed' ? 'dns.failed' : 'dns.nxdomain' }],
      }),
    }),
  );
  await page.goto('/es/dns');
  await fill(page, 'Dominio', 'no-existe.example.com');
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByText('El dominio no existe.')).toBeVisible();
  outcome = 'failed';
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByText('No se pudo consultar el dominio.')).toBeVisible();
  await expect(page.getByText('El dominio no existe.')).toHaveCount(0);
});

test('503 explains that the resolvers are not answering', async ({ page }) => {
  await page.route('**/v1/dns', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({ code: 'dns.unavailable', message: { code: 'dns.unavailable' } }),
    }),
  );
  await page.goto('/es/dns');
  await fill(page, 'Dominio', 'example.com');
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByRole('alert')).toContainText('resolutores');
});

test('a shared link fills the input and the scope but never queries on its own', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/v1/dns', (route) => {
    calls++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/es/dns#u=www.example.com&t=registrable');
  await expect(page.getByLabel('Dominio')).toHaveValue('www.example.com');
  await page.waitForTimeout(500);
  expect(calls).toBe(0);
});
