import { defineConfig, devices } from '@playwright/test';

// PW_CHANNEL=chrome uses the installed Google Chrome instead of Playwright's own Chromium.
const channel = process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {};

// The tests always run against a fresh build of dist/, on a port of their own. Reusing whatever
// listens there would test `astro dev` (no CSP meta, different bundles) or a stale build: with
// `pnpm dev` on 4321 the CSP test failed for that reason. A busy port is an error, not a reuse.
const port = Number(process.env.E2E_PORT ?? 4322);
const origin = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: origin, trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm build && node scripts/serve-dist.mjs',
    url: `${origin}/es/`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { ASTRO_TELEMETRY_DISABLED: '1', PORT: String(port) },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...channel } },
    {
      name: 'mobile-320',
      use: { ...devices['Desktop Chrome'], ...channel, viewport: { width: 320, height: 640 } },
    },
  ],
});
