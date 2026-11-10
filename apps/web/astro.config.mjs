import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';

const API_ORIGIN = new URL(process.env.PUBLIC_API_URL ?? 'http://localhost:8787').origin;

export default defineConfig({
  output: 'static',
  integrations: [vue()],
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  build: { inlineStylesheets: 'auto' },
  // Strict CSP with hashes for every inline script and style Astro emits (Principio V).
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        `connect-src 'self' ${API_ORIGIN}`,
        "img-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
    },
  },
  vite: {
    resolve: {
      // The pre-minified build of tldts packs the Public Suffix List trie far better than
      // bundling its ES sources (≈ 49 KB vs 114 KB gzipped): it keeps pages under 150 KB.
      alias: [{ find: /^tldts$/, replacement: 'tldts/dist/index.esm.min.js' }],
    },
  },
});
