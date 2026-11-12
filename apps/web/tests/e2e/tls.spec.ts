import { expect, expectAccessible, fill, test } from './fixtures.ts';

const ANALYSIS = {
  input: 'example.com',
  host: { unicode: 'example.com', ascii: 'example.com' },
  port: 443,
  protocol: 'TLSv1.3',
  cipher: 'TLS_AES_256_GCM_SHA384',
  alpn: 'h2',
  sniSent: true,
  trust: 'untrusted',
  chain: [
    {
      subject: 'CN=example.com',
      issuer: 'CN=Example CA',
      subjectAltNames: ['DNS:example.com', 'DNS:www.example.com'],
      serialNumber: '0A1B',
      validFrom: '2025-01-01T00:00:00.000Z',
      validTo: '2026-01-01T00:00:00.000Z',
      daysRemaining: -315,
      signatureAlgorithm: 'ecdsa-with-SHA256',
      fingerprint256: 'AB:CD:EF',
      isCa: false,
    },
    {
      subject: 'CN=Example CA',
      issuer: 'CN=Example Root',
      subjectAltNames: [],
      serialNumber: '02',
      validFrom: '2020-01-01T00:00:00.000Z',
      validTo: '2030-01-01T00:00:00.000Z',
      daysRemaining: 1146,
      signatureAlgorithm: 'ecdsa-with-SHA384',
      fingerprint256: '12:34',
      isCa: true,
    },
  ],
  problems: [{ code: 'tls.expired', params: { date: '2026-01-01T00:00:00.000Z' } }],
  transparency: { status: 'embedded', count: 2 },
  catalogVersion: '1.3.0',
};

const CORS = { 'Access-Control-Allow-Origin': '*' };

test('shows an expired certificate with its chain, not hidden behind an error', async ({
  page,
}) => {
  let body = '';
  await page.route('**/v1/tls', (route) => {
    body = route.request().postData() ?? '';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(ANALYSIS),
    });
  });
  await page.goto('/es/tls');
  await fill(page, 'Sitio', 'example.com');
  await page.getByRole('button', { name: 'Analizar' }).click();
  await expect(page.getByText('No es de confianza', { exact: false })).toBeVisible();
  await expect(page.getByText('caducó', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CN=example.com' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CN=Example CA' })).toBeVisible();
  await expect(page.getByText('TLSv1.3')).toBeVisible();
  await expect(page.getByText('-315', { exact: false })).toBeVisible();
  expect(JSON.parse(body)).toEqual({ target: 'example.com' });
  await expectAccessible(page);
});

test('"Enviar a" carries the input to HTTP Headers (and DNS once published)', async ({ page }) => {
  await page.route('**/v1/tls', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(ANALYSIS),
    }),
  );
  await page.goto('/es/tls');
  await fill(page, 'Sitio', 'example.com');
  await page.getByRole('button', { name: 'Analizar' }).click();
  const headers = page.getByRole('link', { name: 'HTTP Headers' }).last();
  await expect(headers).toHaveAttribute('href', /\/es\/headers#u=https%3A%2F%2Fexample\.com/);
});

test('HTTP Headers offers TLS when the certificate is not valid (002/T053)', async ({ page }) => {
  await page.route('**/v1/headers', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({
        input: 'https://self-signed.example/',
        finalUrl: null,
        hops: 0,
        stopReason: 'error',
        status: null,
        headers: [],
        security: [],
        cookies: [],
        error: { code: 'inspect.tls' },
        catalogVersion: '1.3.0',
      }),
    }),
  );
  await page.goto('/es/headers');
  await fill(page, 'URL', 'https://self-signed.example/');
  await page.getByRole('button', { name: 'Analizar' }).click();
  await expect(page.getByRole('link', { name: 'Revisar el certificado en TLS' })).toHaveAttribute(
    'href',
    /\/es\/tls#u=/,
  );
});

test('a shared #u= link never calls the API on its own', async ({ page }) => {
  let calls = 0;
  await page.route('**/v1/tls', (route) => {
    calls++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/es/tls#u=example.com');
  await expect(page.getByLabel('Sitio')).toHaveValue('example.com');
  await page.waitForTimeout(500);
  expect(calls).toBe(0);
});
