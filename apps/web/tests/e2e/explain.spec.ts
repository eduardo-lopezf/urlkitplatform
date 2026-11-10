import { expect, expectAccessible, fill, test } from './fixtures.ts';

test('names the real site behind userinfo (quickstart 9)', async ({ page }) => {
  await page.goto('/es/explain');
  await fill(page, 'URL', 'https://paypal.com@ejemplo-malo.xyz/login');
  await expect(page.locator('mark')).toHaveText('ejemplo-malo.xyz');
  await expect(page.locator('.signals')).toContainText('El sitio real es ejemplo-malo.xyz');
  await expect(page.locator('.signals')).not.toContainText(/seguro|peligroso/i);
});

test('explains a campaign URL part by part', async ({ page }) => {
  await page.goto('/es/explain');
  await fill(page, 'URL', 'https://www.tienda.example.com/oferta?utm_source=boletin&color=rojo');
  await expect(page.getByText('utm_source: parámetro de seguimiento de UTM')).toBeVisible();
  await expect(page.getByText('color: parámetro que el sitio puede usar')).toBeVisible();
});

test('a homograph shows its Punycode and a notice', async ({ page }) => {
  await page.goto('/es/explain');
  await fill(page, 'URL', 'https://аррӏе.com/');
  await expect(page.locator('.site')).toContainText('xn--');
  await expect(page.locator('.signals')).toContainText('otro alfabeto');
});

test('switching language changes the text and keeps the URL', async ({ page }) => {
  const url = 'https://paypal.com@ejemplo-malo.xyz/login';
  await page.goto(`/es/explain#u=${encodeURIComponent(url)}`);
  await expect(page.locator('.signals')).toContainText('El sitio real');
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en\/explain#u=/);
  await expect(page.locator('.signals')).toContainText('The real site is ejemplo-malo.xyz');
});

test('the explain page is accessible (AA)', async ({ page }) => {
  await page.goto('/es/explain');
  await fill(
    page,
    'URL',
    'https://paypal.com@ejemplo-malo.xyz:8081/login?u=https%3A%2F%2Fx.example',
  );
  await expect(page.locator('.signals')).toBeVisible();
  await expectAccessible(page);
});
