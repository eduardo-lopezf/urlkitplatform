/** The pages that are not tools: axe AA and no horizontal scroll, also at 320 px (T101a, SC-008). */
import { expect, expectAccessible, test } from './fixtures.ts';

const PAGES = ['/es/', '/en/', '/es/about', '/en/about', '/es/api', '/en/api'];

for (const path of PAGES) {
  test(`${path} is accessible and fits the viewport`, async ({ page }) => {
    await page.goto(path);
    await expectAccessible(page);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });
}
