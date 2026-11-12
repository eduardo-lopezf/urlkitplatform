import { expect, expectAccessible, fill, test } from './fixtures.ts';

test('clean → explain → inspect using only "Enviar a"', async ({ page }) => {
  await page.goto('/es/clean');
  await fill(page, 'URL', 'https://ejemplo.com/a?utm_source=x');
  await page
    .getByRole('navigation', { name: 'Enviar a' })
    .getByRole('link', { name: 'Explain URL' })
    .click();
  await expect(page).toHaveURL(/\/es\/explain#u=/);
  await expect(page.getByLabel('URL')).toHaveValue('https://ejemplo.com/a');
  await page
    .getByRole('navigation', { name: 'Enviar a' })
    .getByRole('link', { name: 'Redirect Inspector' })
    .click();
  await expect(page).toHaveURL(/\/es\/inspect#u=/);
  await expect(page.getByLabel('URL')).toHaveValue('https://ejemplo.com/a');
});

for (const [tool, fragment, check] of [
  [
    'clean',
    `u=${encodeURIComponent('https://e.example/?utm_source=x&id=1')}&m=safe`,
    '#clean-output',
  ],
  ['parse', `u=${encodeURIComponent('https://e.example/?a=1')}`, '#parse-output'],
  ['explain', `u=${encodeURIComponent('https://e.example/')}`, 'mark'],
  [
    'diff',
    `a=${encodeURIComponent('https://e.example/1')}&b=${encodeURIComponent('https://e.example/2')}&o=p%2Cn`,
    '.diffs',
  ],
  ['inspect', `u=${encodeURIComponent('https://e.example/')}`, '#inspect-input'],
] as const) {
  test(`a copied ${tool} link reproduces the input in a fresh context`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseURL}/es/${tool}#${fragment}`);
    await expect(page.locator(check).first()).toBeVisible();
    expect(await context.cookies()).toEqual([]);
    await context.close();
  });
}

test('the home input suggests the right tool', async ({ page }) => {
  await page.goto('/es/');
  await fill(page, /Pega una URL/, 'https://bit.ly/3abc');
  await expect(page.getByRole('link', { name: 'Abrir Redirect Inspector' })).toBeVisible();
  await fill(page, /Pega una URL/, 'https://a.example/1 https://a.example/2');
  await expect(page.getByRole('link', { name: 'Abrir URL Diff' })).toBeVisible();
  await fill(page, /Pega una URL/, 'https://a.example/?utm_source=x');
  await page.getByRole('link', { name: 'Abrir Smart Cleaner' }).click();
  await expect(page.locator('#clean-output')).toHaveText('https://a.example/');
  await expectAccessible(page);
});

test('the root redirects by browser language', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/(es|en)\/$/);
});

// 002/T089: the v2 network tools chain through "Enviar a", and none of them calls the API on
// arrival: each analysis needs its own click.
test('headers → TLS → DNS → Security Analysis using only "Enviar a"', async ({ page }) => {
  const calls: Record<string, number> = { headers: 0, tls: 0, dns: 0, security: 0 };
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const empty = { state: 'empty', records: [] };
  const bodies: Record<string, unknown> = {
    headers: {
      input: 'https://shop.example/',
      finalUrl: 'https://shop.example/',
      hops: 0,
      stopReason: 'final',
      status: 200,
      headers: [],
      security: [],
      cookies: [],
      catalogVersion: '1.3.0',
    },
    tls: {
      input: 'https://shop.example/',
      host: { unicode: 'shop.example', ascii: 'shop.example' },
      port: 443,
      protocol: 'TLSv1.3',
      cipher: 'TLS_AES_128_GCM_SHA256',
      alpn: 'h2',
      sniSent: true,
      trust: 'trusted',
      chain: [],
      problems: [],
      transparency: { status: 'absent', count: 0 },
      catalogVersion: '1.3.0',
    },
    dns: {
      input: 'https://shop.example/',
      name: { unicode: 'shop.example', ascii: 'shop.example' },
      alternative: null,
      outcome: 'exists',
      dnssec: 'unsigned',
      resolver: 'cloudflare',
      records: {
        A: empty,
        AAAA: empty,
        CNAME: empty,
        MX: empty,
        NS: empty,
        TXT: empty,
        CAA: empty,
        SOA: empty,
      },
      warnings: [],
    },
  };
  for (const tool of ['headers', 'tls', 'dns', 'security'])
    await page.route(`**/v1/${tool}`, (route) => {
      calls[tool] = (calls[tool] ?? 0) + 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify(bodies[tool] ?? {}),
      });
    });
  const sendTo = (name: string) =>
    page.getByRole('navigation', { name: 'Enviar a' }).getByRole('link', { name, exact: true });

  await page.goto('/es/headers');
  await fill(page, 'URL', 'https://shop.example/');
  await page.getByRole('button', { name: 'Analizar' }).click();
  await sendTo('TLS').click();
  await expect(page).toHaveURL(/\/es\/tls#u=/);
  await expect(page.getByLabel('Sitio')).toHaveValue('https://shop.example/');
  await page.waitForTimeout(300);
  expect(calls.tls).toBe(0);

  await page.getByRole('button', { name: 'Analizar' }).click();
  await sendTo('DNS').click();
  await expect(page).toHaveURL(/\/es\/dns#u=/);
  await expect(page.getByLabel('Dominio')).toHaveValue('https://shop.example/');
  await page.waitForTimeout(300);
  expect(calls.dns).toBe(0);

  await page.getByRole('button', { name: 'Consultar' }).click();
  await sendTo('Security Analysis').click();
  await expect(page).toHaveURL(/\/es\/security#u=/);
  await expect(page.getByLabel('URL')).toHaveValue('https://shop.example/');
  await page.waitForTimeout(300);
  expect(calls.security).toBe(0);
});

test('Redirect Inspector and Explain URL offer the v2 tools', async ({ page }) => {
  await page.goto('/es/explain#u=' + encodeURIComponent('https://e.example/'));
  const nav = page.getByRole('navigation', { name: 'Enviar a' });
  await expect(nav.getByRole('link', { name: 'Security Analysis' })).toBeVisible();
});
