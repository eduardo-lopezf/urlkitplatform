import { expect, expectAccessible, fill, test } from './fixtures.ts';

const CHAIN = {
  input: 'https://bit.example/x',
  hops: [
    {
      index: 0,
      url: 'https://bit.example/x',
      status: 301,
      type: 'permanent',
      location: 'https://t.example/y',
      durationMs: 40,
      flags: ['domain-change'],
    },
    {
      index: 1,
      url: 'https://t.example/y',
      status: 302,
      type: 'temporary',
      location: 'https://destino.example/a?utm_source=x',
      durationMs: 30,
      flags: ['domain-change'],
    },
    {
      index: 2,
      url: 'https://destino.example/a?utm_source=x',
      status: 200,
      type: 'final',
      location: null,
      durationMs: 50,
      flags: [],
    },
  ],
  final: 'https://destino.example/a?utm_source=x',
  stopReason: 'final',
  totalMs: 120,
};

test('renders the chain and "Limpiar destino" opens the cleaner with it', async ({ page }) => {
  let calls = 0;
  await page.route('**/v1/inspect', (route) => {
    calls++;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'RateLimit-Remaining': '9',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'RateLimit-Remaining',
      },
      body: JSON.stringify(CHAIN),
    });
  });
  await page.goto('/es/inspect');
  await fill(page, 'URL', 'https://bit.example/x');
  await page.getByRole('button', { name: 'Inspeccionar' }).click();
  await expect(page.getByText('Paso 3')).toBeVisible();
  await expect(page.getByText('Estado 301')).toBeVisible();
  await expect(page.getByText('Llegó al destino.')).toBeVisible();
  expect(calls).toBe(1);
  await expectAccessible(page);
  await page.getByRole('link', { name: 'Limpiar destino' }).click();
  await expect(page).toHaveURL(/\/es\/clean#u=/);
  await expect(page.locator('#clean-output')).toHaveText('https://destino.example/a');
});

test('the quota message shows the remaining time and other tools still work', async ({ page }) => {
  await page.route('**/v1/inspect', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: {
        'Retry-After': '1800',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Retry-After',
      },
      body: JSON.stringify({
        code: 'quota.exceeded',
        message: { code: 'quota.exceeded' },
        retryAfterSeconds: 1800,
      }),
    }),
  );
  await page.goto('/es/inspect');
  await fill(page, 'URL', 'https://bit.example/x');
  await page.getByRole('button', { name: 'Inspeccionar' }).click();
  await expect(page.getByRole('alert')).toContainText('30 min');
  await expect(page.getByRole('alert')).toContainText('red compartida');
  await page.goto('/es/clean');
  await fill(page, 'URL', 'https://ejemplo.com/?utm_source=x');
  await expect(page.locator('#clean-output')).toHaveText('https://ejemplo.com/');
});

test('a shared #u= link fills the input but never runs the inspection on its own', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/v1/inspect', (route) => {
    calls++;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CHAIN),
    });
  });
  await page.goto(`/es/inspect#u=${encodeURIComponent('https://bit.example/x')}`);
  await expect(page.getByLabel('URL')).toHaveValue('https://bit.example/x');
  await page.waitForTimeout(500);
  expect(calls).toBe(0);
});
