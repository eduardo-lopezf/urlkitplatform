import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page, type Request } from '@playwright/test';

/** Every request leaving the page, so tests can assert that local tools send no URL. */
export const test = base.extend<{ requests: Request[] }>({
  requests: async ({ page }, use) => {
    const requests: Request[] = [];
    page.on('request', (r) => requests.push(r));
    // The metrics beacon goes to the API, which is not running in e2e: answer it locally.
    await page.route('**/v1/metrics/events', (route) => route.fulfill({ status: 204 }));
    await use(requests);
  },
});

export { expect };

export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

export async function fill(page: Page, label: string | RegExp, value: string) {
  const field = page.getByLabel(label).first();
  await field.fill(value);
}

/** Only the metrics beacon may leave the page, and it never carries the URL. */
export function expectNoUrlLeak(requests: Request[], origin: string, secret: string) {
  const external = requests.filter((r) => !r.url().startsWith(origin));
  for (const r of external) {
    expect(r.url()).toMatch(/\/v1\/metrics\/events$/);
    expect(r.postData() ?? '').not.toContain(secret);
  }
  for (const r of requests) {
    expect(r.url()).not.toContain(encodeURIComponent(secret));
    expect(r.postData() ?? '').not.toContain(secret);
  }
}
