import { expect, expectAccessible, fill, test } from './fixtures.ts';

const SAMPLE = 'https://usuario@münchen.de:8080/a%20b/c?x=1&x=2&y=#sec';

test('shows every component (quickstart 4)', async ({ page }) => {
  await page.goto('/es/parse');
  await fill(page, 'URL', SAMPLE);
  await expect(page.getByLabel('Host (Unicode)')).toHaveValue('münchen.de');
  await expect(page.getByLabel('Host (Punycode)')).toHaveValue('xn--mnchen-3ya.de');
  await expect(page.getByLabel('Puerto')).toHaveValue('8080');
  await expect(page.getByLabel('Ruta decodificada')).toHaveValue('/a b/c');
  await expect(page.getByLabel('Fragmento')).toHaveValue('sec');
  await expect(page.getByLabel('Valor x')).toHaveCount(2);
  await expect(page.getByLabel('Valor y')).toHaveValue('');
});

test('editing a value rebuilds a valid URL', async ({ page }) => {
  await page.goto('/es/parse');
  await fill(page, 'URL', 'https://ejemplo.com/?q=hola');
  const value = page.getByLabel('Valor q');
  await value.fill('café con leche');
  await value.press('Enter');
  await value.blur();
  await expect(page.locator('#parse-output')).toHaveText(
    'https://ejemplo.com/?q=caf%C3%A9%20con%20leche',
  );
});

test('invalid input names the problematic part', async ({ page }) => {
  await page.goto('/es/parse');
  await fill(page, 'URL', 'https://ejemplo.com:99999/');
  await expect(page.getByRole('alert')).toContainText('puerto');
});

test('works with the keyboard only', async ({ page }) => {
  await page.goto('/es/parse');
  await page.keyboard.type('https://ejemplo.com/?a=1');
  await expect(page.locator('#parse-output')).toHaveText('https://ejemplo.com/?a=1');
  await page.getByRole('button', { name: 'Añadir parámetro' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#parse-output')).toHaveText('https://ejemplo.com/?a=1&param=');
});

test('the parser page is accessible (AA)', async ({ page }) => {
  await page.goto('/es/parse');
  await fill(page, 'URL', SAMPLE);
  await expect(page.locator('#parse-output')).toBeVisible();
  await expectAccessible(page);
});
