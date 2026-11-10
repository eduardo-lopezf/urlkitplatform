import { defineConfig, devices } from '@playwright/test';

// PW_CHANNEL=chrome uses the installed Google Chrome instead of Playwright's own Chromium.
const channel = process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:4321', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm build && node scripts/serve-dist.mjs',
    url: 'http://localhost:4321/es/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { ASTRO_TELEMETRY_DISABLED: '1' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...channel } },
    {
      name: 'mobile-320',
      use: { ...devices['Desktop Chrome'], ...channel, viewport: { width: 320, height: 640 } },
    },
  ],
});
