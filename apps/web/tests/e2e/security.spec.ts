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
  // A one-line summary of what was not checked comes before the findings (T088a), and links to
  // the full block, which sits right below the findings, always.
  const summary = page.locator('.not-checked-summary');
  await expect(summary).toContainText('la reputación del sitio y el contenido de la página');
  const order = await page.evaluate(() => {
    const s = document.querySelector('.not-checked-summary');
    const f = document.querySelector('section[aria-labelledby="security-findings"]');
    return !!s && !!f && !!(s.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);
  await expect(summary.getByRole('link', { name: 'Ver detalles' })).toHaveAttribute(
    'href',
    '#security-not-checked',
  );
  const notChecked = page.getByRole('heading', { name: 'Qué no se ha comprobado' });
  // "Ver detalles" is an in-page link: following it keeps the result on screen.
  await summary.getByRole('link', { name: 'Ver detalles' }).click();
  await expect(notChecked).toBeInViewport();
  await expect(headings.first()).toHaveText('Gravedad alta');
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

test('on a phone, the most serious finding is on screen when the review arrives', async ({
  page,
}) => {
  // Pre-test of 2026-11-17: at 360 × 740 the summary and "Destino final" pushed the high finding
  // below the fold, and people who do not scroll took the summary for the main problem.
  await page.setViewportSize({ width: 360, height: 740 });
  await page.route('**/v1/security', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(REVIEW),
    }),
  );
  await page.goto('/es/security');
  await fill(page, 'URL', 'https://postman-echo.com/redirect-to?url=http://example.com/');
  await page.getByRole('button', { name: 'Analizar' }).click();
  const high = page.locator('.group[data-severity="high"]');
  await expect(high).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.not-checked-summary')).toBeInViewport({ ratio: 1 });
});

test('a part stopped by an invalid certificate reads as its consequence, not a failure', async ({
  page,
}) => {
  // Pre-test of 2026-11-17: with an invalid certificate, "Incompleto" next to Redirecciones and
  // Cabeceras read as a failure of the tool, not as a consequence of the problem it found.
  const stopped = { state: 'incomplete', reason: { code: 'inspect.tls' } };
  await page.route('**/v1/security', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({
        ...REVIEW,
        finalUrl: undefined,
        findings: [
          {
            code: 'tls.expired',
            severity: 'high',
            tool: 'tls',
            params: { date: '2015-04-12' },
          },
        ],
        parts: { ...REVIEW.parts, redirects: stopped, headers: stopped },
      }),
    }),
  );
  await page.goto('/es/security');
  await fill(page, 'URL', 'https://expired.badssl.com/');
  await page.getByRole('button', { name: 'Analizar' }).click();
  const parts = page.locator('dl.parts dd');
  await expect(parts.nth(1)).toHaveText('Sin revisar: el certificado del destino no es válido.');
  await expect(parts.nth(2)).toHaveText('Sin revisar: el certificado del destino no es válido.');
  // A part that stopped for another reason still says it is incomplete, with its reason.
  await expect(parts.nth(4)).toContainText('Incompleto');
  await expect(parts.nth(4)).toContainText('Los resolutores DNS no responden');
  await expectAccessible(page);
});

test('the summary above the findings says the review is not a verdict on the site', async ({
  page,
}) => {
  // Pre-test of 2026-11-17: the two people who do not scroll never read the note at the end.
  await page.route('**/v1/security', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(REVIEW),
    }),
  );
  await page.goto('/es/security');
  await fill(page, 'URL', URL_IN);
  await page.getByRole('button', { name: 'Analizar' }).click();
  await expect(page.locator('.not-checked-summary')).toContainText(
    'Esta revisión no dice si puedes fiarte del sitio',
  );
  await page.goto('/en/security');
  await fill(page, 'URL', URL_IN);
  await page.getByRole('button', { name: 'Analyze' }).click();
  await expect(page.locator('.not-checked-summary')).toContainText(
    'This review does not say whether you can trust the site',
  );
});
