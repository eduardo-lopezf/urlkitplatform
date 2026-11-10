import { expect, expectAccessible, expectNoUrlLeak, fill, test } from './fixtures.ts';

test('paste → clean result → copy, without sending the URL anywhere', async ({
  page,
  context,
  requests,
  baseURL,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/es/clean');
  await fill(page, 'URL', 'https://shop.example/p?id=7&utm_source=secreto-campana&fbclid=y');
  const output = page.locator('#clean-output');
  await expect(output).toHaveText('https://shop.example/p?id=7');
  await expect(page.getByText('utm_source=secreto-campana')).toBeVisible();
  await page.getByRole('button', { name: 'Copiar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'https://shop.example/p?id=7',
  );
  expectNoUrlLeak(requests, baseURL ?? '', 'secreto-campana');
  expect(await context.cookies()).toEqual([]);
});

test('unwraps a Google redirect (quickstart 2)', async ({ page }) => {
  await page.goto('/es/clean');
  await fill(
    page,
    'URL',
    'https://www.google.com/url?q=https%3A%2F%2Fejemplo.com%2F%3Futm_medium%3Dz',
  );
  await expect(page.locator('#clean-output')).toHaveText('https://ejemplo.com/');
});

test('"limpieza máxima" shows the preview and persists after reload', async ({ page }) => {
  await page.goto('/es/clean');
  const url = 'https://www.amazon.es/Altavoz/dp/B08N5WRWNW/ref=sr_1_3?crid=2X&qid=1';
  await fill(page, 'URL', url);
  await expect(page.getByText('Con limpieza máxima quedaría así')).toBeVisible();
  await expect(page.locator('.preview output')).toHaveText('https://www.amazon.es/dp/B08N5WRWNW');
  await page.getByRole('switch', { name: 'Limpieza máxima' }).check();
  await expect(page.locator('#clean-output')).toHaveText('https://www.amazon.es/dp/B08N5WRWNW');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Limpieza máxima' })).toBeChecked();
});

test('keeping a removed param recalculates the result', async ({ page }) => {
  await page.goto('/es/clean');
  await fill(page, 'URL', 'https://ejemplo.com/?utm_source=x&id=1');
  await page.getByLabel('Conservar utm_source').check();
  await expect(page.locator('#clean-output')).toHaveText('https://ejemplo.com/?utm_source=x&id=1');
});

test('an already clean URL says so', async ({ page }) => {
  await page.goto('/en/clean');
  await fill(page, 'URL', 'https://ejemplo.com/ruta?id=1');
  await expect(page.getByText('This URL is already clean')).toBeVisible();
});

test('the cleaner page is accessible (AA)', async ({ page }) => {
  await page.goto('/es/clean');
  await fill(page, 'URL', 'https://shop.example/p?id=7&utm_source=x');
  await expect(page.locator('#clean-output')).toBeVisible();
  await expectAccessible(page);
});
