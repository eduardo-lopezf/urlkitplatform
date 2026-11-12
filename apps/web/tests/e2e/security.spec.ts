import { expect, expectAccessible, fill, test } from './fixtures.ts';

const URL_IN = 'https://bit.example/x';

const REVIEW = {
  input: URL_IN,
  finalUrl: 'http://plain.example.com/',
  findings: [
    {
      code: 'security.hop.https-downgrade',
      severity: 'high',
      tool: 'inspect',
      params: { host: 'bit.example' },
    },
    { code: 'tls.expiring-soon', severity: 'low', tool: 'tls', params: { days: 5 } },
    { code: 'headers.hsts.missing', severity: 'medium', tool: 'headers' },
    {
      code: 'explain.signal.abuse-tld',
      severity: 'info',
      tool: 'explain',
      params: { tld: 'example' },
    },
  ],
  parts: {
    explain: { state: 'complete' },
    redirects: { state: 'complete' },
    headers: { state: 'complete' },
    tls: { state: 'complete' },
    dns: { state: 'incomplete', reason: { code: 'dns.unavailable' } },
  },
  scope: {
    checked: ['explain', 'inspect', 'headers', 'tls'],
    notChecked: ['reputation', 'content'],
  },
  catalogVersion: '1.3.0',
};

const CORS = { 'Access-Control-Allow-Origin': '*' };

test('groups findings by severity, links each to its tool and never gives a verdict', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/v1/security', (route) => {
    calls++;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(REVIEW),
    });
  });
  await page.goto('/es/security');
  await fill(page, 'URL', URL_IN);
  await page.getByRole('button', { name: 'Analizar' }).click();
  const headings = page.locator('section[aria-labelledby="security-findings"] h3');
  await expect(headings).toHaveText([
    'Gravedad alta',
    'Gravedad media',
    'Gravedad baja',
    'Informativo',
  ]);
  await expect(page.getByText('Pasa de https a http', { exact: false }).first()).toBeVisible();
  const detail = page.getByRole('link', { name: /Ver detalle en HTTP Headers/ });
  await expect(detail).toHaveAttribute('href', /\/es\/headers#u=/);
  await expect(page.getByRole('link', { name: /Ver detalle en TLS/ })).toHaveAttribute(
    'href',
    /\/es\/tls#u=/,
  );
  // What is not checked sits right below the findings, always.
  const notChecked = page.getByRole('heading', { name: 'Qué no se ha comprobado' });
  await expect(notChecked).toBeVisible();
  await expect(page.getByText('reputación', { exact: false }).first()).toBeVisible();
  // The incomplete part is named with its reason.
  await expect(page.getByText('Los resolutores DNS no responden', { exact: false })).toBeVisible();
  // No score, grade or "safe" label anywhere.
  const text = (await page.locator('main').innerText()).toLowerCase();
  for (const word of ['puntuación', 'nota:', 'veredicto', 'es seguro', 'seguro.', 'score', 'grade'])
    expect(text).not.toContain(word);
  expect(calls).toBe(1);
  await expectAccessible(page);
});

test('an empty review still says what was not checked', async ({ page }) => {
  await page.route('**/v1/security', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({ ...REVIEW, findings: [] }),
    }),
  );
  await page.goto('/es/security');
  await fill(page, 'URL', URL_IN);
  await page.getByRole('button', { name: 'Analizar' }).click();
  await expect(
    page.getByText('No hemos encontrado problemas en lo que se ha comprobado', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qué no se ha comprobado' })).toBeVisible();
  await expectAccessible(page);
});

test('a shared #u= link never calls the API on its own', async ({ page }) => {
  let calls = 0;
  await page.route('**/v1/security', (route) => {
    calls++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto(`/es/security#u=${encodeURIComponent(URL_IN)}`);
  await expect(page.getByLabel('URL')).toHaveValue(URL_IN);
  await page.waitForTimeout(500);
  expect(calls).toBe(0);
});
