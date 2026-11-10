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
