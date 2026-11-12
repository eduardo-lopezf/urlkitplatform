import { expect, expectAccessible, fill, test } from './fixtures.ts';

const URL_IN = 'https://bit.example/secret-path?token=abc';

const ANALYSIS = {
  input: URL_IN,
  finalUrl: 'https://destino.example/',
  hops: 1,
  stopReason: 'final',
  status: 200,
  headers: [
    { name: 'Content-Type', value: 'text/html' },
    { name: 'Set-Cookie', value: '<omitido>' },
    { name: 'X-Script', value: '<script>alert(1)</script>' },
  ],
  security: [
    {
      header: 'strict-transport-security',
      state: 'missing',
      findings: [{ code: 'headers.hsts.missing' }],
    },
    { header: 'content-security-policy', state: 'present', findings: [] },
    { header: 'x-content-type-options', state: 'present', findings: [] },
    { header: 'x-frame-options', state: 'present', findings: [] },
    { header: 'referrer-policy', state: 'present', findings: [] },
    {
      header: 'permissions-policy',
      state: 'missing',
      findings: [{ code: 'headers.permissions.missing' }],
    },
  ],
  cookies: [
    {
      name: 'sid',
      secure: false,
      httpOnly: true,
      sameSite: 'lax',
      findings: [{ code: 'headers.cookie.not-secure', params: { name: 'sid' } }],
    },
  ],
  catalogVersion: '1.3.0',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'RateLimit-Remaining, Retry-After',
};

test('analyzes on demand and shows status, headers, security and cookies', async ({
  page,
  requests,
}) => {
  let calls = 0;
  let body = '';
  await page.route('**/v1/headers', (route) => {
    calls++;
    body = route.request().postData() ?? '';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ...CORS, 'RateLimit-Remaining': '9' },
      body: JSON.stringify(ANALYSIS),
    });
  });
  await page.goto('/es/headers');
  await fill(page, 'URL', URL_IN);
  await page.getByRole('button', { name: 'Analizar' }).click();
  await expect(page.getByText('Estado 200')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'X-Script' })).toBeVisible();
  // Values are text: the script is shown, never run.
  await expect(page.getByRole('cell', { name: '<script>alert(1)</script>' })).toBeVisible();
  await expect(page.getByText('Falta Strict-Transport-Security', { exact: false })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'sid', exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Ver la cadena en Redirect Inspector' }),
  ).toBeVisible();
  expect(calls).toBe(1);
  expect(JSON.parse(body)).toEqual({ url: URL_IN });
  // The URL travels only in the POST body.
  for (const r of requests) expect(r.url()).not.toContain('secret-path');
  await expectAccessible(page);
});

test('copies the header table as text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/v1/headers', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(ANALYSIS),
    }),
  );
  await page.goto('/es/headers');
  await fill(page, 'URL', URL_IN);
  await page.getByRole('button', { name: 'Analizar' }).click();
  await page.getByRole('button', { name: 'Copiar cabeceras' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'Content-Type: text/html\nSet-Cookie: <omitido>\nX-Script: <script>alert(1)</script>',
  );
});

test('a shared #u= link fills the input but never calls the API on its own', async ({ page }) => {
  let calls = 0;
  await page.route('**/v1/headers', (route) => {
    calls++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto(`/es/headers#u=${encodeURIComponent(URL_IN)}`);
  await expect(page.getByLabel('URL')).toHaveValue(URL_IN);
  await page.waitForTimeout(500);
  expect(calls).toBe(0);
});

test('the quota message shows the wait and other tools still work', async ({ page }) => {
  await page.route('**/v1/headers', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { ...CORS, 'Retry-After': '1800' },
      body: JSON.stringify({
        code: 'quota.exceeded',
        message: { code: 'quota.exceeded' },
        retryAfterSeconds: 1800,
      }),
    }),
  );
  await page.goto('/es/headers');
  await fill(page, 'URL', URL_IN);
  await page.getByRole('button', { name: 'Analizar' }).click();
  await expect(page.getByRole('alert')).toContainText('30 min');
  await page.goto('/es/clean');
  await fill(page, 'URL', 'https://ejemplo.com/?utm_source=x');
  await expect(page.locator('#clean-output')).toHaveText('https://ejemplo.com/');
});

// The "Enviar a TLS" link is asserted in tls.spec.ts (002/T053), once the TLS page exists.
test('a TLS error is explained, and dark mode stays accessible', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.route('**/v1/headers', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({
        ...ANALYSIS,
        finalUrl: null,
        hops: 0,
        stopReason: 'error',
        status: null,
        headers: [],
        security: [],
        cookies: [],
        error: { code: 'inspect.tls' },
      }),
    }),
  );
  await page.goto('/es/headers');
  await fill(page, 'URL', 'https://self-signed.example/');
  await page.getByRole('button', { name: 'Analizar' }).click();
  await expect(
    page.getByText('El certificado de seguridad del destino no es válido.'),
  ).toBeVisible();
  // Links only go to pages that exist.
  const PAGES =
    /^\/es\/(|clean|parse|inspect|diff|explain|headers|metadata|tls|dns|security|about|api)(#.*)?$/;
  for (const href of await page
    .locator('a[href^="/es/"]')
    .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? '')))
    expect(href).toMatch(PAGES);
  await expectAccessible(page);
});
