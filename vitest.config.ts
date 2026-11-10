import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/core',
      'packages/contracts',
      'packages/rules',
      'packages/i18n',
      'apps/api',
      'tooling/boundaries',
    ],
  },
});
