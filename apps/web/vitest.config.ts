import { defineConfig } from 'vitest/config';

// Unit tests of the web's own modules (002/T013). E2E lives in tests/e2e and runs with Playwright.
export default defineConfig({ test: { include: ['tests/unit/**/*.test.ts'] } });
