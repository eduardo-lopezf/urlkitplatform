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
  await expect(page.locator('.site mark')).toHaveText('xn--80ak6aa92e.com');
  await expect(page.locator('.site')).toContainText('Imita a: аррӏе.com');
  await expect(page.locator('.signals')).toContainText('otro alfabeto');
  // The part-by-part list agrees with the card: next to "El sitio real" it must not show the
  // Unicode form, which reads as the site it imitates (simulated pre-test, 2026-11-17).
  const parts = page.locator('.parts');
  await expect(parts.locator('dt', { hasText: 'Dominio registrable' })).toContainText(
    'xn--80ak6aa92e.com',
  );
  await expect(parts.locator('dt', { hasText: 'Host' })).toContainText('xn--80ak6aa92e.com');
  await expect(parts).not.toContainText('аррӏе.com');
});

test('opening another shared link in the same tab shows that link', async ({ page }) => {
  // Only the fragment changes, so the browser does not load the page again (pre-test 2026-11-17).
  await page.goto(`/es/explain#u=${encodeURIComponent('https://paypal.com@ejemplo-malo.xyz/')}`);
  await expect(page.locator('.site mark')).toHaveText('ejemplo-malo.xyz');
  await page.evaluate(() => {
    location.hash = `u=${encodeURIComponent('https://login.example.com.evil.top/')}`;
  });
  await expect(page.locator('.site mark')).toHaveText('evil.top');
});

test('a legitimate international domain keeps its Unicode form first', async ({ page }) => {
  await page.goto('/es/explain');
  await fill(page, 'URL', 'https://www.münchen.de/');
  await expect(page.locator('.site mark')).toHaveText('münchen.de');
  await expect(page.locator('.site')).toContainText('www.xn--mnchen-3ya.de');
  await expect(page.locator('.site')).not.toContainText('Imita a');
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
