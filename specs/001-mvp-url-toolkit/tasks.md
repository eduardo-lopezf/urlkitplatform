---

description: "Task list for the URLkit MVP (Smart Cleaner, URL Parser, Redirect Inspector, URL Diff, Explain URL)"
---

# Tasks: MVP de URLkit — Smart Cleaner, URL Parser, Redirect Inspector, URL Diff y Explain URL

**Input**: Design documents from `/specs/001-mvp-url-toolkit/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: INCLUIDOS. La constitución (Principio VI) exige pruebas primero en el núcleo de cada
herramienta, pruebas de contrato para la API y pruebas de extremo a extremo de los flujos
principales. Escribe cada prueba primero y comprueba que falla antes de implementar.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Include exact file paths in descriptions

## Path Conventions

Monorepo pnpm (ver [plan.md](./plan.md)): `packages/core`, `packages/rules`,
`packages/contracts`, `packages/i18n`, `packages/ui`, `apps/web` (Astro + Vue 3), `apps/api`
(Node + Hono), `infrastructure/`. Rutas relativas a la raíz del repositorio.

Las tareas con sufijo de letra (`T005a`) se añadieron después de la enmienda 1.1.0 de la
constitución y de la revisión de la estructura; conservan el número de la tarea con la que se
ejecutan para no renumerar el resto. El grafo de dependencias entre paquetes y sus invariantes
están en [plan.md](./plan.md), sección "Grafo de dependencias".

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo, herramientas y puertas de calidad

- [X] T001 Run `git init`, create `.gitignore` (node_modules, dist, .astro, coverage, .env*, playwright-report) and root `package.json` with scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `size`, `lhci` at repository root
- [X] T002 Create `pnpm-workspace.yaml` listing `packages/*` and `apps/*`, and `.npmrc` with `strict-peer-dependencies=true`
- [X] T003 [P] Create shared TypeScript config `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, target ES2022, module ESNext) at repository root
- [X] T004 [P] Configure ESLint (flat config) and Prettier in `eslint.config.js` and `.prettierrc` at repository root
- [X] T005 [P] Scaffold `packages/core` (package.json `@urlkit/core`, tsconfig, `src/index.ts`, Vitest config, no runtime deps other than `tldts` and `punycode`)
- [X] T005a [P] Scaffold `packages/contracts` (package.json `@urlkit/contracts`, Zod, `src/v1/`, `src/errors.ts`, build script that emits `packages/contracts/openapi.json`, Vitest config; no dependency on `@urlkit/rules`, `@urlkit/i18n` or `@urlkit/ui`)
- [X] T006 [P] Scaffold `packages/rules` (package.json `@urlkit/rules`, `data/`, `schema/`, `build/`, `tests/corpus/`, Vitest config)
- [X] T007 [P] Scaffold `packages/i18n` (package.json `@urlkit/i18n`, `src/es.json`, `src/en.json`, `src/index.ts`)
- [X] T008 [P] Scaffold `packages/ui` (package.json `@urlkit/ui`, Vue 3 peer dependency, `src/tokens.css`, `src/components/`)
- [X] T009 [P] Scaffold `apps/web` with Astro static output, `@astrojs/vue` integration and i18n routing for locales `es`, `en` in `apps/web/astro.config.mjs`
- [X] T010 [P] Scaffold `apps/api` with Hono, `@hono/zod-openapi`, Zod, `undici`, `ioredis`, Node entry `apps/api/src/server.ts` listening on port 8787
- [X] T011 [P] Create `docker-compose.yml` with a Valkey/Redis service on port 6379 at repository root
- [X] T011a [P] Add to `docker-compose.yml` a dedicated egress network for the API/inspector that blocks internal ranges (second barrier, never a substitute for IP validation), documented in `infrastructure/README.md` with the equivalent configuration for the managed deployment
- [X] T012 [P] Create `apps/api/Dockerfile` (multi-stage build, non-root user, `NODE_ENV=production`)
- [X] T013 Create CI workflow running `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm size`, `pnpm lhci` in `.github/workflows/ci.yml`
- [X] T013a Declare the package dependency boundaries with `dependency-cruiser` in `.dependency-cruiser.cjs` and add `pnpm boundaries` to CI: `packages/core` imports nothing from the repository except types (never `rules`, `contracts`, `i18n`, `ui`); `packages/contracts` imports only the code list from `@urlkit/core`; `packages/ui` imports nothing from the domain; only `apps/api/src/presentation/` may import `@urlkit/i18n`; seed one violation per rule in a fixture test asserting the checker fails
- [X] T013b [P] Create `infrastructure/caddy/Caddyfile` (reverse proxy to the API, automatic HTTPS) and `infrastructure/monitoring/` (Prometheus scrape config and OpenTelemetry collector config), referenced from `docker-compose.yml`
- [X] T014 [P] Configure `size-limit` with a budget of "JS inicial < 150 KB comprimido" per page in `apps/web/.size-limit.json`
- [X] T015 [P] Configure Lighthouse CI (simulated 4G, assert load < 1 s, accessibility ≥ 0.95) in `apps/web/lighthouserc.json`
- [X] T016 [P] Configure Playwright with `@axe-core/playwright`, projects for desktop and a 320 px viewport, in `apps/web/playwright.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Núcleo de URLs, registro de herramientas, catálogo de reglas, i18n, sistema de
diseño, esqueleto web y API. Necesario para todas las historias.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundational ⚠️

- [X] T017 [P] Download Web Platform Tests `urltestdata.json` (BSD-3, note license in a README next to it) into `packages/core/tests/vectors/urltestdata.json` and write a Vitest suite asserting `parseUrl` matches every vector in `packages/core/tests/unit/url-wpt.test.ts`
- [X] T018 [P] Write edge-case vector tests in `packages/core/tests/unit/url-edge.test.ts`: input without scheme → `schemeAssumed: true` with `https://`; input "longitud de entrada ≤ 32.000" else `url.too-long`; multiple URLs → first one plus warning `input.multiple-urls`; repeated params, `x` (value `null`) vs `x=` (empty string), invalid percent-encoding (`encodingValid: false`), IDN `münchen.de` → `xn--mnchen-3ya.de`, IPv4/IPv6 and unusual numeric IPv4 forms
- [X] T019 [P] Write tests for the tool registry (`registerTool`, `getTool`, `listTools`, duplicate id rejected) in `packages/core/tests/unit/registry.test.ts`
- [X] T020 [P] Write rules schema tests (unique `id`, `domain-rule` always `mode: max`, valid `kind` values `tracking-param` | `wrapper` | `domain-rule`) in `packages/rules/tests/schema.test.ts`
- [X] T021 [P] Write i18n parity test (es and en have exactly the same keys; every code used by core exists) in `packages/i18n/tests/parity.test.ts`
- [X] T021a [P] Write code-contract parity test: every code exported by `packages/core/src/codes.ts` appears in the `enum` of the generated `packages/contracts/openapi.json` and vice versa, so the published contract cannot diverge from what the core emits, in `packages/contracts/tests/codes-parity.test.ts`
- [X] T021b [P] Write catalog version tests: the compiled catalog exposes a semantic `version`; changing any rule file without bumping it fails; `clean` and `explain` results carry `catalogVersion`, in `packages/rules/tests/version.test.ts`
- [X] T021c [P] Create the language-neutral SSRF vector set in `tests/ssrf-vectors/vectors.json` (each case: input URL or hostname plus simulated resolver answer, and expected verdict `allow` | `block` with reason) and a README stating that any service making outbound requests, in any language, must run it (Principio V)
- [X] T022 [P] Write API privacy tests: logger never outputs URL, query or IP fields; `subjectHash` is `HMAC-SHA256(IP o prefijo /64, clave_del_día)` and changes when the UTC day changes, in `apps/api/tests/integration/privacy.test.ts`
- [X] T023 [P] Write quota limiter tests (fixed hour/day windows, TTL equals remaining window, `RateLimit-Limit`/`RateLimit-Remaining`/`RateLimit-Reset` and `Retry-After` headers, `quota.exceeded` error, metrics quota 300/hour per visitor returns 429) in `apps/api/tests/integration/quota.test.ts`
- [X] T023a [P] Write tests for the discriminated `Subject` type: the limiter resolves a quota for each variant (`anon-ip` implemented; `api-key` and `organization` reachable through the same interface), Valkey keys include the subject type in the prefix, and `RateLimit-*` headers are identical for every variant, in `apps/api/tests/integration/subject.test.ts`
- [X] T023b [P] Write a test asserting the published OpenAPI declares the optional `apiKey` security scheme and that every endpoint still answers without credentials, so enabling keys in v3 stays additive, in `packages/contracts/tests/security.test.ts`

### Implementation for Foundational

- [X] T024 Define shared types `MessageRef`, `ToolError` (codes `url.invalid`, `url.too-long`, `url.unsupported-scheme`, `inspect.blocked`, `inspect.timeout`, `inspect.tls`, `quota.exceeded`) and `ParsedUrl`/`QueryParam` exactly as in data-model.md in `packages/core/src/types.ts`
- [X] T024a Extract the message and error code list to `packages/core/src/codes.ts` as a frozen const array plus derived type, as the single source of truth; `ToolError` and `MessageRef` reference it (Principio X)
- [X] T024b Implement the `/v1` request and response Zod schemas for the five tools in `packages/contracts/src/v1/`, derive the error `enum` from `@urlkit/core` codes plus the contract-owned codes (`quota.exceeded` and, reserved for v3, `auth.missing`, `auth.invalid`) in `packages/contracts/src/errors.ts`, declare the optional `apiKey` bearer security scheme, and add the build that emits `packages/contracts/openapi.json` (makes T021a, T023b pass)
- [X] T025 Implement `parseUrl(input)` using native WHATWG `URL`, `tldts` for `registrableDomain`/`subdomain`, `punycode` for `host.unicode`, and raw query extraction preserving order, duplicates and original encoding, in `packages/core/src/url/parse.ts` (makes T017, T018 pass)
- [X] T026 [P] Implement normalization helpers (lowercase host, drop default port, equivalent percent-encoding, trailing slash) in `packages/core/src/url/normalize.ts`
- [X] T027 [P] Implement `serializeUrl(parts)` that rebuilds a URL from components with correct encoding and round-trip guarantee in `packages/core/src/url/serialize.ts`
- [X] T028 Implement tool registry per contracts/tool-registry.md (`ToolDefinition`, `ToolContext`, `registerTool`, `getTool`, `listTools`) in `packages/core/src/registry.ts`
- [X] T029 Create JSON schema for `CleaningRule` (fields `id`, `kind`, `mode`, `scope`, `match`, `exceptions`, `platform`, `reason`) in `packages/rules/schema/rule.schema.json`
- [X] T030 Implement rules compiler (validate with schema, build exact-name set, prefix list, wrapper index by host, domain-rule index by registrable domain) emitting `packages/rules/dist/compiled.ts` from `packages/rules/build/compile.ts`
- [X] T030a Make the compiled catalog expose its semantic `version` read from `packages/rules/package.json`, and define the `RuleCatalog` type in `packages/core/src/tools/clean/catalog.ts` so the core receives the catalog instead of importing it (makes T021b pass)
- [X] T031 Implement i18n lookup `t(ref: MessageRef, lang: 'es' | 'en')` with parameter interpolation and fallback to `en` in `packages/i18n/src/index.ts`
- [X] T032 [P] Create design tokens (color, typography, spacing, radius; light and dark via `prefers-color-scheme` plus `[data-theme]`) in `packages/ui/src/tokens.css`
- [X] T033 [P] Create base Vue components `UrlInput` (paste, trim, 150 ms debounce), `ResultBox`, `CopyButton` (one-click copy with accessible confirmation), `ErrorMessage` (shows `ToolError.part`), `InertLink` (renders non-`http(s)` schemes as plain text) in `packages/ui/src/components/`
- [X] T034 Create web layout with header, tool navigation, language switcher that preserves the fragment, and no cookies or third-party scripts in `apps/web/src/layouts/Base.astro`
- [X] T035 [P] Create root language redirect page (`navigator.language` → `/es/` or `/en/`) in `apps/web/src/pages/index.astro`
- [X] T036 [P] Implement shareable fragment helpers (`readFragment`, `writeFragment`, values encoded with `encodeURIComponent`, warning text before copying a link) in `apps/web/src/lib/share.ts`
- [X] T037 [P] Implement anonymous metrics beacon `track(tool, outcome)` sending only `{tool, outcome}` via `navigator.sendBeacon` to `POST /v1/metrics/events`, ignoring 429 responses silently, in `apps/web/src/lib/metrics.ts`
- [X] T038 Implement privacy module: `subjectHash(ip)` with daily key derived from server secret + UTC date, IPv6 reduced to /64, and a structured logger that strips URL, query and IP fields, in `apps/api/src/privacy/` (makes T022 pass)
- [X] T039 Implement quota module with the discriminated `Subject` type declared in full (`{ type: 'anon-ip', hash }` implemented; `{ type: 'api-key', keyId, organizationId }` and `{ type: 'organization', organizationId }` declared and resolved through the same interface, unimplemented in the MVP), Valkey keys including the subject type in the prefix, `Plan` (`anonymous`: `inspect: { hour: 10, day: 50 }`, `local: { hour: 600 }`, `metrics: { hour: 300 }`), Redis fixed-window counters with key `quota:{tool}:{window}:{windowStart}:{subjectHash}` and in-memory fallback for development, in `apps/api/src/quota/` (makes T023 pass)
- [X] T040 Implement Hono app with `/v1` router, OpenAPI generation served at `/v1/openapi.json`, `ToolError` error handler, request size limit, CORS for the web origin and quota middleware adding `RateLimit-*` headers, in `apps/api/src/app.ts`
- [X] T041 Implement aggregated metrics (`tool_runs_total{tool,outcome}`, `errors_total{tool,code}`, `inspect_duration_seconds` histogram) and `POST /v1/metrics/events` (body `{tool, outcome}`, `additionalProperties: false`, responds 204, with `metrics` quota of 300/hour per visitor returning 429) in `apps/api/src/metrics/` and `apps/api/src/routes/v1/metrics.ts`
- [X] T040a Implement the serialization layer that resolves the optional `?lang` parameter by looking codes up in `@urlkit/i18n`, confined to `apps/api/src/presentation/`, keeping codes always present and text as an addition, never a replacement, in `apps/api/src/presentation/localize.ts`
- [X] T041a Implement OpenTelemetry tracing with span attributes limited to registrable domain, status and duration (never path, query or fragment) and Sentry with scrubbing, plus a test asserting no input field reaches the error service, in `apps/api/src/observability/`
- [X] T042 Write contract test harness that validates any API response against `specs/001-mvp-url-toolkit/contracts/openapi.yaml` in `apps/api/tests/contract/harness.ts`

- [X] T042a Write the consumer side of the contract and a divergence test: the web's inspect client typed from `packages/contracts` works against the published schema, and `specs/001-mvp-url-toolkit/contracts/openapi.yaml` and the generated `packages/contracts/openapi.json` do not diverge (CI fails if the generated file is stale), in `packages/contracts/tests/divergence.test.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Smart Cleaner (Priority: P1) 🎯 MVP

**Goal**: Limpiar una URL de seguimiento y envoltorios, en modo seguro por defecto y "limpieza
máxima" opcional, sin cuenta ni publicidad.

**Independent Test**: pegar URLs reales con seguimiento en `/es/clean`; el resultado abre el mismo
contenido, sin parámetros de seguimiento, con la lista de eliminados y copia con un clic.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T043 [P] [US1] Write unit tests for `clean` using **synthetic catalogs** written for each case (the core receives the catalog, it does not import it), covering: `catalogVersion` echoed from the injected catalog, tracking params removed with reason, functional params kept, `keep` list honored, wrapper unwrapping incl. nested (`https://www.google.com/url?q=...`), `changed: false` when already clean, `ref` exception domains, `maxPreview` present only in `safe` mode, determinism, in `packages/core/tests/unit/clean.test.ts`
- [X] T044 [P] [US1] Create corpus of ≥ 200 real tracked URLs with expected clean output (one case per rule minimum) in `packages/rules/tests/corpus/urls.json` and a test asserting ≥ 95 % of tracking params removed and 100 % expected outputs in `packages/rules/tests/corpus.test.ts`
- [X] T045 [P] [US1] Write contract test for `POST /v1/clean` (200 `CleanResult`, 400 `ToolError`, 429) in `apps/api/tests/contract/clean.test.ts`
- [X] T046 [P] [US1] Write e2e test: paste → result → copy; toggle "limpieza máxima" shows preview and persists after reload; no cookies set; no network request contains the URL; axe AA passes at 320 px, in `apps/web/tests/e2e/clean.spec.ts`

### Implementation for User Story 1

- [X] T047 [P] [US1] Add tracking-param rules (`mode: safe`, global) for at least `utm_*`, `fbclid`, `gclid`, `dclid`, `gbraid`, `wbraid`, `msclkid`, `mc_cid`, `mc_eid`, `igshid`, `yclid`, `_hsenc`, `_hsmi`, `mkt_tok`, `twclid`, `ttclid`, and `si` scoped to known domains, each with `platform` and `reason`, in `packages/rules/data/tracking-params.json`
- [X] T048 [P] [US1] Add wrapper rules for search engines, social networks and email "safe links" services (host + path + destination param `q` | `url` | `u`) in `packages/rules/data/wrappers.json`
- [X] T049 [P] [US1] Add domain rules (`mode: max`) for canonical product URLs of known stores (e.g. `/dp/{id}`) and functional-param exceptions such as `ref` in `packages/rules/data/domains/`
- [X] T050 [US1] Implement `clean({ url, mode = 'safe', keep = [], catalog }, ctx)` returning `CleanResult` (`input`, `output`, `mode`, `changed`, `removed`, `unwrapped`, `maxPreview`, `catalogVersion` taken from the injected catalog) in `packages/core/src/tools/clean/clean.ts`. The catalog is **injected**, never imported: the core must not depend on `packages/rules` (makes T043, T044 pass)
- [X] T051 [US1] Register the `clean` tool (`runsOn: 'client'`, Zod input/output schemas, `sendTo: ['parse','explain','diff','inspect']`, share encode/decode `#u=<url>&m=safe|max&k=<param1>,<param2>`) in `packages/core/src/tools/clean/index.ts`
- [X] T052 [P] [US1] Add es/en texts for every clean `reason` code and UI label in `packages/i18n/src/es.json` and `packages/i18n/src/en.json`
- [X] T053 [US1] Build `CleanerIsland` (input, result with copy, removed list with "conservar" toggles, mode switch saved in `localStorage` wrapped in try/catch, "already clean" state, "Expandir enlace acortado" action linking to `/{lang}/inspect#u=`) in `apps/web/src/islands/CleanerIsland.tsx`
- [X] T054 [US1] Create pages `apps/web/src/pages/[lang]/clean.astro` and home `apps/web/src/pages/[lang]/index.astro` (single input that routes to the cleaner by default)
- [X] T055 [US1] Implement `POST /v1/clean` using the registered core tool, the schemas from `packages/contracts`, the compiled catalog injected by the adapter and `local` quota, in `apps/api/src/routes/v1/clean.ts`. The route only validates, applies quota, injects the catalog, invokes and serializes — no cleaning logic (Principio VIII; makes T045 pass)

**Checkpoint**: Smart Cleaner fully functional — first releasable increment

---

## Phase 4: User Story 2 - URL Parser (Priority: P2)

**Goal**: Ver y editar los componentes de una URL y reconstruirla al instante.

**Independent Test**: pegar `https://usuario@münchen.de:8080/a%20b/c?x=1&x=2&y=#sec` en `/es/parse`
y comprobar cada componente; editar un parámetro reconstruye una URL válida.

### Tests for User Story 2 ⚠️

- [X] T056 [P] [US2] Write unit tests for `parse` tool (output equals `ParsedUrl`; edit/add/remove/reorder params then `serializeUrl` round-trips; password present but flagged for masking; `warnings` for implementation-divergent inputs per FR-022) in `packages/core/tests/unit/parse-tool.test.ts`
- [X] T057 [P] [US2] Write contract test for `POST /v1/parse` in `apps/api/tests/contract/parse.test.ts`
- [X] T058 [P] [US2] Write e2e test (components shown, host Unicode + `xn--mnchen-3ya.de`, editing a value updates the URL, invalid input shows error naming the part, keyboard-only use, axe AA) in `apps/web/tests/e2e/parse.spec.ts`

### Implementation for User Story 2

- [X] T059 [US2] Implement and register the `parse` tool (`runsOn: 'client'`, edit operations `setComponent`, `setParam`, `addParam`, `removeParam`, `moveParam`, share `#u=<url>`) in `packages/core/src/tools/parse/index.ts`
- [X] T060 [P] [US2] Add es/en texts for component names and parser warnings in `packages/i18n/src/es.json` and `packages/i18n/src/en.json`
- [X] T061 [US2] Build `ParserIsland` (component table, editable query table with add/remove/reorder, masked password with reveal, live rebuilt URL with copy) in `apps/web/src/islands/ParserIsland.tsx`
- [X] T062 [US2] Create page `apps/web/src/pages/[lang]/parse.astro`
- [X] T063 [US2] Implement `POST /v1/parse` in `apps/api/src/routes/v1/parse.ts` (makes T057 pass)

**Checkpoint**: User Stories 1 and 2 work independently

---

## Phase 5: User Story 3 - Redirect Inspector (Priority: P3)

**Goal**: Mostrar la cadena completa de redirecciones desde el servidor, con protección SSRF y
límite de 10/hora y 50/día por visitante.

**Independent Test**: inspeccionar un enlace acortado de prueba con 2 saltos; ver 3 pasos con estado
y duración, sin que el navegador visite ningún salto; los destinos internos se bloquean.

### Tests for User Story 3 ⚠️

- [X] T064 [P] [US3] Write unit tests for pure hop interpretation (status → `permanent` | `temporary`, `meta refresh` parsing, literal JavaScript `location` assignment detection, loop detection on normalized URL, stop at 20 hops → `max-hops`, flags `https-downgrade` and `domain-change`) in `packages/core/tests/unit/inspect.test.ts`
- [X] T065 [P] [US3] Write SSRF tests driven by `tests/ssrf-vectors/vectors.json` (the suite iterates the shared vectors; adding a vector must not require touching the suite) with a fake DNS resolver, covering the full surface: block IPv4 private, loopback, link-local incl. `169.254.169.254`, CGNAT, multicast, reserved, unspecified; IPv6 `::1`, `fc00::/7`, `fe80::/10`, IPv4-mapped; DNS rebinding (second resolution differs); a public host that redirects to an internal one; credentials in URL; ports outside 80, 443, 8080, 8443; non-`http(s)` schemes, in `apps/api/tests/ssrf/ssrf.test.ts`
- [X] T066 [P] [US3] Write integration tests with a local HTTP fixture server: 5 s per-hop timeout, 15 s total, body read capped at 256 KB and only for HTML, no cookies sent, TLS error stops at that hop with `inspect.tls`, 4xx/5xx reported as final hop, in `apps/api/tests/integration/inspect.test.ts`
- [X] T067 [P] [US3] Write contract test for `POST /v1/inspect` (200 `RedirectChain` with `hops` maxItems 21; blocked/loop/timeout reported via `stopReason`, not HTTP errors; 429 after 10 requests in an hour with `Retry-After`) in `apps/api/tests/contract/inspect.test.ts`
- [X] T068 [P] [US3] Write e2e test with mocked API (chain rendered, "Limpiar destino" opens cleaner with destination, quota message shows remaining time and other tools still work, opening a shared `#u=` link does not auto-run the inspection) in `apps/web/tests/e2e/inspect.spec.ts`

### Implementation for User Story 3

- [X] T069 [US3] Implement pure inspect logic (`Hop`, `RedirectChain`, `stopReason` `final` | `loop` | `max-hops` | `blocked` | `error` | `timeout`, hop classifier, meta-refresh and JS-location detectors) and register the `inspect` tool (`runsOn: 'server'`, `ctx.fetchHop` injected) in `packages/core/src/tools/inspect/` (makes T064 pass)
- [X] T070 [US3] Implement safe HTTP client with `undici` and a custom `lookup` that validates all resolved IPs and pins the connection to the validated IP, with `maxRedirections: 0` (the service follows hops itself so it can revalidate each one), proxy environment variables ignored (they would break IP pinning), and scheme/credentials/port checks repeated on every hop, in `apps/api/src/inspect/safe-fetch.ts`. The full surface ships here: nothing is deferred to v2 (Principio V; makes T065 pass)
- [X] T071 [US3] Implement `fetchHop` adapter (`GET`, identifiable `User-Agent`, no cookies, 5 s timeout, 256 KB HTML body cap, TLS errors mapped to `inspect.tls`) and the 15 s total-chain deadline in `apps/api/src/inspect/fetch-hop.ts` (makes T066 pass)
- [X] T072 [US3] Implement `POST /v1/inspect` with `inspect` quota (10/hour, 50/day), metrics `inspect_duration_seconds`, and logs without URLs in `apps/api/src/routes/v1/inspect.ts` (makes T067 pass)
- [X] T073 [P] [US3] Add es/en texts for hop types, stop reasons, block reasons, quota message (including shared-network explanation) in `packages/i18n/src/es.json` and `packages/i18n/src/en.json`
- [X] T074 [P] [US3] Implement API client `inspect(url)` reading `RateLimit-*`/`Retry-After` headers in `apps/web/src/lib/api.ts`
- [X] T075 [US3] Build `InspectorIsland` (explicit "Inspeccionar" button, hop timeline with status/type/duration/flags, final destination with copy, "Limpiar destino" and "Enviar a" actions, loading and quota-exceeded states) in `apps/web/src/islands/InspectorIsland.tsx`
- [X] T076 [US3] Create page `apps/web/src/pages/[lang]/inspect.astro`
- [X] T106 [US3] Write unit tests for generic interstitial detection (FR-037, R22): `<a href>` followed only when identical to a decoded query-parameter URL of the hop, HTML entities in `href` decoded, no follow when no parameter matches, meta refresh and literal JS take precedence, the reached destination is `final` even with 410, in `packages/core/tests/unit/inspect.test.ts`
- [X] T107 [US3] Implement interstitial detection and the `interstitial` hop type in `packages/core/src/tools/inspect/` (makes T106 pass)
- [X] T108 [P] [US3] Add `interstitial` to the hop type in `packages/contracts/src/v1/inspect.ts`, `contracts/openapi.yaml` and the generated `packages/contracts/openapi.json`, and its es/en texts in `packages/i18n/src/`

**Checkpoint**: User Stories 1–3 work independently

---

## Phase 6: User Story 4 - URL Diff (Priority: P4)

**Goal**: Comparar dos URLs por componente y parámetro con opciones de normalización.

**Independent Test**: comparar dos URLs que solo difieren en `utm_campaign` y en el orden de
parámetros con "ignorar orden" → solo se informa `utm_campaign`.

### Tests for User Story 4 ⚠️

- [X] T077 [P] [US4] Write unit tests for `diff` (classification `added` | `removed` | `modified` per component and param; option defaults `ignoreParamOrder: true`, `ignoreTracking: false`, `normalize: true`; `equivalent` true after normalization with `cosmetic` list; repeated params) in `packages/core/tests/unit/diff.test.ts`
- [X] T078 [P] [US4] Write contract test for `POST /v1/diff` in `apps/api/tests/contract/diff.test.ts`
- [X] T079 [P] [US4] Write e2e test (two inputs, toggles, equivalent message, share link `#a=<url>&b=<url>&o=<opciones>` reproduces state, axe AA) in `apps/web/tests/e2e/diff.spec.ts`

### Implementation for User Story 4

- [X] T080 [US4] Implement and register the `diff` tool returning `UrlComparison` (reuses `normalize`; when `ignoreTracking` is on, uses the **injected** catalog and reports its `catalogVersion`) in `packages/core/src/tools/diff/index.ts` (makes T077 pass)
- [X] T081 [P] [US4] Add es/en texts for diff labels and options in `packages/i18n/src/es.json` and `packages/i18n/src/en.json`
- [X] T082 [US4] Build `DiffIsland` (two inputs, option toggles, side-by-side component/param differences, cosmetic differences collapsed) in `apps/web/src/islands/DiffIsland.tsx`
- [X] T083 [US4] Create page `apps/web/src/pages/[lang]/diff.astro`
- [X] T084 [US4] Implement `POST /v1/diff` in `apps/api/src/routes/v1/diff.ts` (makes T078 pass)

**Checkpoint**: User Stories 1–4 work independently

---

## Phase 7: User Story 5 - Explain URL (Priority: P5)

**Goal**: Explicar cada parte de una URL en lenguaje sencillo y señalar avisos, con reglas fijas
y sin IA.

**Independent Test**: explicar `https://paypal.com@ejemplo-malo.xyz/login` → aviso
`userinfo-deception` y dominio real `ejemplo-malo.xyz`.

### Tests for User Story 5 ⚠️

- [X] T085 [P] [US5] Write unit tests for every signal id `userinfo-deception`, `ip-host`, `homograph`, `mixed-scripts`, `excessive-encoding`, `double-encoding`, `dangerous-scheme`, `unusual-port`, `nested-url`, `abuse-tld` (severity only `info` | `caution`, never a verdict), tracking params mapped to `platform`, and determinism (same input → same output) in `packages/core/tests/unit/explain.test.ts`
- [X] T086 [P] [US5] Write contract test for `POST /v1/explain` incl. `?lang=es|en` adding `text` to each `MessageRef` in `apps/api/tests/contract/explain.test.ts`
- [X] T087 [P] [US5] Write e2e test (campaign URL explained part by part, homograph shows Punycode and warning, language switch changes text, axe AA) in `apps/web/tests/e2e/explain.spec.ts`

### Implementation for User Story 5

- [X] T088 [P] [US5] Add abuse-prone TLD list with source and review date in `packages/rules/data/abuse-tlds.json`
- [X] T089 [US5] Implement and register the `explain` tool (parts with `MessageRef`, signals via Unicode script regex `\p{Script=...}` for homographs/mixed scripts, **injected** catalog for platforms and abuse TLDs, `catalogVersion` in the result) in `packages/core/src/tools/explain/index.ts` (makes T085 pass)
- [X] T090 [P] [US5] Write plain-language es/en texts for every part and signal code in `packages/i18n/src/es.json` and `packages/i18n/src/en.json`
- [X] T091 [US5] Build `ExplainIsland` (registrable domain highlighted, part-by-part list, signals as informational notices, never a "safe/unsafe" verdict) in `apps/web/src/islands/ExplainIsland.tsx`
- [X] T092 [US5] Create page `apps/web/src/pages/[lang]/explain.astro`
- [X] T093 [US5] Implement `POST /v1/explain` with optional `lang` in `apps/api/src/routes/v1/explain.ts` (makes T086 pass)

**Checkpoint**: All five tools work independently

---

## Phase 8: User Story 6 - Moverse entre herramientas sin fricción (Priority: P6)

**Goal**: "Enviar a" entre todas las herramientas y enlaces compartibles coherentes.

**Independent Test**: limpiar → "Enviar a Explain URL" → "Enviar a Redirect Inspector" usando solo
botones; la URL se conserva; un enlace copiado reproduce la entrada en otra ventana sin cuenta.

### Tests for User Story 6 ⚠️

- [X] T094 [P] [US6] Write e2e test for the clean → explain → inspect flow and for opening copied share links in a fresh context for every tool in `apps/web/tests/e2e/navigation.spec.ts`

### Implementation for User Story 6

- [X] T095 [US6] Create `SendTo` component that reads `sendTo` from the registry and navigates to `/{lang}/{tool}#u=<result>` in `packages/ui/src/components/SendTo.tsx`
- [X] T096 [US6] Add `SendTo` and "Copiar enlace" (with the warning that the recipient will see the URL) to all five islands in `apps/web/src/islands/`
- [X] T097 [US6] Make the home input suggest the right tool (one URL → cleaner; two URLs → diff; shortener domain → inspector) in `apps/web/src/islands/HomeIsland.tsx`

**Checkpoint**: Complete MVP

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Mejoras que afectan a varias historias

- [X] T098 [P] Write privacy e2e test: no cookies on any page, no request other than `POST /v1/metrics/events` for local tools, API logs after quickstart scenarios 5–7 contain no URLs/IPs, Redis has only `quota:*` keys with TTL, in `apps/web/tests/e2e/privacy.spec.ts` (logs and Valkey checks live in `apps/api/tests/integration/valkey.test.ts`, which runs when `REDIS_URL` is set: the e2e starts neither the API nor Valkey)
- [X] T099 [P] Add security headers (strict CSP without inline scripts from third parties, `Referrer-Policy: no-referrer`, `Permissions-Policy`, HSTS) to static hosting config in `apps/web/public/_headers`
- [X] T100 [P] Add an "Acerca de / Privacidad" page explaining no ads, no account, no cookies and what anonymous counters exist in `apps/web/src/pages/[lang]/about.astro`
- [X] T101 [P] Publish human-readable API docs page rendered from `/v1/openapi.json` in `apps/web/src/pages/[lang]/api.astro`
- [X] T102 Run `pnpm size` and `pnpm lhci`, fix any page over budget (JS inicial < 150 KB, carga < 1 s 4G) in `apps/web/`
- [ ] T103 Run a usability check for SC-007 (≥ 90 % of non-technical participants identify the real domain with Explain URL) and record results in `specs/001-mvp-url-toolkit/validation/usability.md`
- [X] T104 [P] Write project `README.md` (what it is, how to run, links to spec and constitution) at repository root
- [X] T105 Run every scenario in `specs/001-mvp-url-toolkit/quickstart.md` and record pass/fail in `specs/001-mvp-url-toolkit/validation/quickstart-run.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all user stories
- **User Stories (Phases 3–8)**: depend on Foundational
- **Polish (Phase 9)**: depends on the desired stories being complete

### User Story Dependencies

- **US1 Smart Cleaner (P1)**: after Foundational; no other story needed
- **US2 URL Parser (P2)**: after Foundational; independent
- **US3 Redirect Inspector (P3)**: after Foundational; its "Limpiar destino" link targets the US1 page but tests mock it, so it stays independently testable
- **US4 URL Diff (P4)**: after Foundational; `ignoreTracking` reuses the rules catalog (T047 from US1) — if US1 is not done, only the tracking option is unavailable
- **US5 Explain URL (P5)**: after Foundational; platform names reuse T047 (same note as US4)
- **US6 Navigation (P6)**: after all of US1–US5

### Within Each User Story

- Tests first and failing → rules/data → core tool → i18n texts → island/page → API endpoint
- Core tool before its island and its endpoint

### Parallel Opportunities

- Setup: T003–T012 and T014–T016 in parallel
- Foundational: all tests T017–T023 in parallel; then T026, T027, T032, T033, T035, T036, T037 in parallel
- Once Foundational is done, US1–US5 can be built in parallel by different people (they touch different `tools/`, `islands/`, `pages/` and `routes/` files; i18n JSON edits must be merged carefully)
- Within each story, every task marked [P] can run together

---

## Parallel Example: User Story 1

```bash
# Tests first, together:
Task: "Unit tests for clean in packages/core/tests/unit/clean.test.ts"
Task: "Corpus of ≥ 200 URLs in packages/rules/tests/corpus/urls.json"
Task: "Contract test for POST /v1/clean in apps/api/tests/contract/clean.test.ts"
Task: "E2E test in apps/web/tests/e2e/clean.spec.ts"

# Rule data, together:
Task: "Tracking params in packages/rules/data/tracking-params.json"
Task: "Wrappers in packages/rules/data/wrappers.json"
Task: "Domain rules in packages/rules/data/domains/"
```

## Parallel Example: User Story 3

```bash
Task: "Pure hop logic tests in packages/core/tests/unit/inspect.test.ts"
Task: "SSRF tests in apps/api/tests/ssrf/ssrf.test.ts"
Task: "Fixture-server integration tests in apps/api/tests/integration/inspect.test.ts"
Task: "Contract test in apps/api/tests/contract/inspect.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: Smart Cleaner
4. **STOP and VALIDATE**: quickstart scenarios 1–3 and the privacy checks
5. Deploy the static web (the API is only needed for `/v1/clean`)

### Incremental Delivery

1. Setup + Foundational → base ready
2. + Smart Cleaner → first public release
3. + URL Parser → release
4. + Redirect Inspector → first release with the API deployed to production (Redis, SSRF, quotas)
5. + URL Diff → release
6. + Explain URL → release
7. + Navigation and polish → complete MVP

---

## Notes

- [P] tasks = different files, no dependencies
- Every task in a story carries its [USn] label for traceability
- Verify that tests fail before implementing
- Commit after each task or logical group — **the person commits, not a coding agent**: agents
  leave the changes in the working tree and list the files they touched (see `CLAUDE.md`)
- Never log URLs, queries or IPs, even in debug (FR-005, FR-036)
- The core never imports `packages/rules`: the catalog is injected and its version travels in the
  response (Principio X). `pnpm boundaries` enforces this and the rest of the invariants
- Business logic never goes into `apps/api/src/routes`: a route validates, authorizes, meters,
  invokes and responds (Principio VIII)
- The SSRF surface is complete in the MVP; nothing is deferred. Its cases live in
  `tests/ssrf-vectors/` as language-neutral data, because the v2 probe service will have to pass
  the same ones in Python (Principio V)
- Contracts are designed now for API keys, per-organization quotas and future persistence:
  the security scheme is declared and optional, `Subject` is discriminated, and responses that
  depend on the catalog carry its version (Principio IV)
