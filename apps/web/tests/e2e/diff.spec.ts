import { expect, expectAccessible, fill, test } from './fixtures.ts';

test('only utm_campaign differs when order is ignored (quickstart 8)', async ({ page }) => {
  await page.goto('/es/diff');
  await fill(page, 'Primera URL', 'https://a.example/p?x=1&y=2&utm_campaign=otono');
  await fill(page, 'Segunda URL', 'https://a.example/p?y=2&x=1&utm_campaign=invierno');
  await expect(page.getByText('Diferencias (1)')).toBeVisible();
  await expect(page.locator('.diffs code')).toHaveText('utm_campaign');
});

test('toggles change the result and equivalence is stated', async ({ page }) => {
  await page.goto('/es/diff');
  await fill(page, 'Primera URL', 'https://a.example/?id=1&utm_source=x');
  await fill(page, 'Segunda URL', 'https://a.example/?id=1');
  await expect(page.getByText('Diferencias (1)')).toBeVisible();
  await page.getByRole('switch', { name: 'Ignorar parámetros de seguimiento' }).check();
  await expect(page.getByText('Son equivalentes con estas opciones.')).toBeVisible();
});

test('the share link reproduces the state', async ({ page }) => {
  const a = 'https://a.example/?x=1&y=2';
  const b = 'https://a.example/?y=2&x=1';
  await page.goto(`/es/diff#a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&o=n`);
  await expect(page.getByLabel('Primera URL')).toHaveValue(a);
  await expect(
    page.getByRole('switch', { name: 'Ignorar el orden de los parámetros' }),
  ).not.toBeChecked();
  await expect(page.getByText('Diferencias (1)')).toBeVisible();
});

test('the diff page is accessible (AA)', async ({ page }) => {
  await page.goto('/es/diff');
  await fill(page, 'Primera URL', 'https://EJEMPLO.com:443/a/');
  await fill(page, 'Segunda URL', 'https://ejemplo.com/b');
  await expect(page.getByText(/Diferencias \(/)).toBeVisible();
  await expectAccessible(page);
});
