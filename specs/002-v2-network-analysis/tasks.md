---

description: "Task list for URLkit v2 (HTTP Headers, Metadata, TLS, DNS, Security Analysis)"
---

# Tasks: Versión 2 de URLkit — análisis técnico avanzado (HTTP Headers, Metadata, TLS, DNS y Security Analysis)

**Input**: Design documents from `/specs/002-v2-network-analysis/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: INCLUIDOS. El Principio VI exige pruebas primero en el núcleo de cada herramienta,
pruebas de contrato en ambos lados de la API y pruebas de extremo a extremo de los flujos
principales. Escribe cada prueba, comprueba que falla y solo entonces implementa.

**Organization**: las tareas se agrupan por historia de usuario, para poder implementar y probar
cada una por separado.

**Requisito previo (fuera de esta lista)**: conviene cerrar T103 y T111–T114 de la
[feature 001](../001-mvp-url-toolkit/tasks.md) antes de lanzar la v2 (spec, Assumptions).
Ninguna tarea de esta lista depende técnicamente de ellas.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario a la que pertenece (US1–US5)
- Cada descripción incluye la ruta exacta del fichero

## Path Conventions

Es el monorepo de la 001 (ver [plan.md](./plan.md), "Source Code"). Las rutas son relativas a la
raíz del repositorio. Los identificadores de tarea son de esta feature: `T001` aquí no es el
`T001` de la 001; cuando se cita una tarea de la 001 se escribe "001/T*nnn*".

Los identificadores son definitivos. Si más adelante hace falta una tarea nueva, lleva sufijo de
letra (`T012a`) y no se renumera nada (`CLAUDE.md`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencias, decisión de arquitectura documentada y material de pruebas

- [X] T001 Update `docs/arquitectura.md`. In §2, replace the "Versión 2" table (Python + FastAPI, Pydantic, dnspython, cryptography, HTTPX) with the Node stack of research R1 (`undici` + `rawHeaders`, `node:tls` + `X509Certificate`, `@peculiar/asn1-x509`, DoH + `dns-packet`, `parse5`). In §11, record the capability comparison table from research R1 and state that the condition was evaluated for v2 and the Python boundary stays closed. Remove `services/probes/` from the v2 row of the "Directorio / Etapa" table. Add a changelog row (1.3.0, 2026-11-11). Done **before** any code (plan.md, Constitution Check)
- [X] T002 [P] Add `parse5` (exact current major) to `packages/core/package.json` dependencies. It must stay a runtime dependency of the core only, like `tldts` (research R4)
- [X] T003 [P] Add `dns-packet`, `@peculiar/asn1-x509` and `@peculiar/asn1-schema` to `apps/api/package.json` dependencies, plus `@types/dns-packet` to devDependencies. Run `pnpm install` (research R5, R6)
- [X] T004 [P] Write `apps/api/tests/fixtures/tls/generate.sh`. It uses `openssl` to create a test CA (root + intermediate) and leaf certificates: valid for `localhost`; expired (`notAfter` in the past); not yet valid; self-signed; issued for another name (`other.test`); served without its intermediate; signed with `sha1WithRSAEncryption`; and one leaf carrying a fake embedded SCT extension (OID `1.3.6.1.4.1.11129.2.4.2`). Commit the generated PEM files next to it, with a `README.md` saying how to regenerate them and that they are test-only
- [X] T005 [P] Write recorded DoH wire responses as fixtures in `apps/api/tests/fixtures/dns/`. Cover: signed zone with AD set; unsigned zone (AD clear); `SERVFAIL` with EDE 6 (DNSSEC Bogus); `SERVFAIL` without EDE that succeeds with CD; `NXDOMAIN` with AD; `NOERROR` with no answers; MX, CAA, SOA and multi-string TXT answers. Generate them with a script `apps/api/tests/fixtures/dns/build.ts` that uses `dns-packet`, so nothing is opaque binary
  - Done as: `build.ts` exports `answer(query)`, which builds each response with `dns-packet` when the fake resolver asks for it; no binary file is written.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: piezas que usan dos o más herramientas: ampliar el registro, los criterios del
catálogo, el transporte con cabeceras crudas, la sonda de la cadena, el análisis de hosts, las
cuotas, el cliente web y la suite SSRF por conector

**⚠️ CRITICAL**: ninguna historia puede empezar hasta terminar esta fase

### Tests for Foundational ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T006 [P] Extend `packages/core/tests/unit/registry.test.ts`. `TOOL_IDS` contains the five new ids (`headers`, `metadata`, `tls`, `dns`, `security`) after the five MVP ids, in that order. Registering them does not alter the MVP definitions
- [X] T007 [P] Write unit tests for `analyzeHost(input)` in `packages/core/tests/unit/host.test.ts`. Cases:
  - accepts a URL or a bare host with optional port;
  - returns `{ unicode, ascii, registrable, port, kind: 'name' | 'ip' }`, with IDN in both forms (`münchen.de` / `xn--mnchen-3ya.de`);
  - IPv4 and bracketed IPv6 literals give `kind: 'ip'`;
  - special-use names are flagged: `localhost`, `*.localhost`, `.local`, `.test`, `.invalid`, `.example`, `.onion`, `.internal`, `.home.arpa`;
  - empty or invalid input returns a `ToolError` that names the invalid part.
- [X] T008 [P] Write schema and compile tests for the v2 criteria in `packages/rules/tests/criteria.test.ts`. The four data files validate against `packages/rules/schema/criteria.schema.json`. The compiled catalog exposes `security.headers`, `security.tls`, `security.severities` and `metadata.precedence`. Every code in `severities.json` exists in `packages/core/src/codes.ts`. `catalog.lock.json` matches version `1.3.0`
- [X] T009 [P] Write a unit test for the raw-headers transport in `apps/api/tests/integration/raw-headers.test.ts`, against a local HTTP server that sends `Set-Cookie: a=1`, `X-Test: 1`, `Set-Cookie: b=2`, `x-test: 2`. `TransportResponse.rawHeaders` returns `[name, value]` pairs in exactly that order, with original casing and repetitions kept. `headers` (the existing grouped object) is unchanged, so Redirect Inspector is unaffected
- [X] T010 [P] Write integration tests for the chain probe in `apps/api/tests/integration/chain.test.ts`, against fixture servers:
  - follows 2 redirects and returns the final response's `rawHeaders` only;
  - with `body: 'html'`, reads at most 1 MiB of a 2xx HTML body and sets `bodyTruncated: true` beyond it;
  - with `body: 'none'`, never reads the body;
  - a blocked target gives `chain.stopReason: 'blocked'` and `finalResponse: null`;
  - limits are 5 s per hop, 15 s overall and 20 hops, as in 001/R6.
- [X] T011 [P] Parameterize `apps/api/tests/ssrf/ssrf.test.ts` by connector. Read `tests/ssrf-vectors/vectors.json` once and run every vector against each entry of a `CONNECTORS` list: `safeFetch` now, the TLS connector added in US3. Add a guard test that fails if a module under `apps/api/src/probes/` that opens sockets is missing from `CONNECTORS` (research R11)
- [X] T012 [P] Extend `apps/api/tests/integration/quota.test.ts`. Each of `headers`, `metadata`, `tls`, `dns` and `security` allows 10/hour and 50/day per subject. Exhausting one leaves `inspect` and the other four untouched. `RateLimit-*` headers have the same shape for all of them (FR-005, research R9)
- [X] T013 [P] Write unit tests for the generic web client `callTool(tool, body)` in `apps/web/tests/unit/api.test.ts` (use the existing `apps/web` Vitest setup if present, otherwise add it in `apps/web/vitest.config.ts`). Cases:
  - outcomes `ok`, `quota` (with `retryAfterSeconds`), `invalid`, `unavailable` (503) and `network`;
  - `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`;
  - the input only in the JSON body, never in the URL;
  - the existing `inspect()` keeps its current behavior.
  - Done as: `apps/web` added to the Vitest projects in the root `vitest.config.ts`.

### Implementation for Foundational

- [X] T014 Extend `ToolId` and `TOOL_IDS` in `packages/core/src/registry.ts` with `'headers' | 'metadata' | 'tls' | 'dns' | 'security'`. Add to `ToolContext` the optional adapters `fetchChain`, `probeTls` and `queryDns`, with the observation types of [data-model.md](./data-model.md) (`ChainObservation`, `TlsObservation`, `DnsObservation`). Define those types in `packages/core/src/tools/<tool>/types.ts`: chain in `headers/types.ts`, the rest in their own folder (makes T006 pass; contract in [contracts/tool-registry.md](./contracts/tool-registry.md))
- [X] T015 [P] Extend `ToolIdSchema` in `packages/contracts/src/v1/common.ts` with the five new ids. Add to its OpenAPI description, and to the `MessageCode` description, that clients MUST accept enum values they do not know (research R10). Add a shared `SeveritySchema` (`'high' | 'medium' | 'low' | 'info'`) and a shared `StopReasonSchema` reused from the inspect schema
- [X] T016 [P] Implement `analyzeHost(input)` in `packages/core/src/url/host.ts`, reusing `parseUrl`, `punycode` and `tldts` as the core already does. Add the codes `host.invalid`, `dns.ip-literal` and `dns.special-use` to `packages/core/src/codes.ts`, with es/en texts in `packages/i18n/src/es.json` and `packages/i18n/src/en.json` (makes T007 pass)
- [X] T017 Add the criteria data files from [data-model.md](./data-model.md), "Criterios del catálogo":
  - `packages/rules/data/security/headers.json`: evaluated headers; HSTS minimum `max-age` 31536000; valid `X-Frame-Options` (`DENY`, `SAMEORIGIN`); `Referrer-Policy` values with `unsafe-url` flagged; unsafe CSP sources `'unsafe-inline'`, `'unsafe-eval'`, `*`, `data:`, `http:`.
  - `packages/rules/data/security/tls.json`: `expiringSoonDays: 30`; weak signatures `sha1`, `md5`; legacy protocols `TLSv1`, `TLSv1.1`.
  - `packages/rules/data/security/severities.json`: one entry per finding code of US1–US4 plus the Explain URL signal codes (`caution` → `medium`, `info` → `info` by default).
  - `packages/rules/data/metadata/precedence.json`: field → ordered sources, default `["openGraph","twitter","basic"]`.

  Each file has `source` and `reviewed` fields, like `abuse-tlds.json`
  - Done as: `severities.json` starts with the Explain URL signals only, because the schema test (T008) only accepts codes the core already emits. Each story adds its own codes and severities (T029, T041, T054, T067, T080).
- [X] T018 Write `packages/rules/schema/criteria.schema.json`. Extend `packages/rules/build/compile.ts`: exclude the criteria files from rule loading (as `abuse-tlds.json` is), validate them against the schema, include them in the fingerprint and expose them in the compiled catalog. Extend the `RuleCatalog` type in `packages/core/src/tools/clean/catalog.ts` with optional `security` and `metadata` sections. Bump `packages/rules/package.json` to `1.3.0` (MINOR: data added, no rule changed) and run `node build/compile.ts --lock` to update `packages/rules/catalog.lock.json` (makes T008 pass; research R8)
- [X] T019 Add a raw-headers path to `undiciTransport` in `apps/api/src/inspect/safe-fetch.ts`. Use `undici.dispatch` with a `DispatchHandler` that reads `controller.rawHeaders` in `onResponseStart` and returns `rawHeaders: [string, string][]` in `TransportResponse`, next to the existing `headers`. Keep the same pinned `lookup`, `maxRedirections: 0`, explicit dispatcher (no env proxy) and no cookies. The inspector's observable behavior must not change: all existing tests in `apps/api/tests/` stay green (makes T009 pass; research R3)
  - Done as: an interceptor on `agent.compose(...)` copies `controller.rawHeaders` in `onResponseStart` and forwards everything else to undici's own `request()` handler, so the client keeps working exactly as before.
- [X] T020 Implement `createFetchChain({ safeFetch, ... })` in `apps/api/src/probes/chain.ts`. It drives the pure `inspectTool` logic with a `FetchHop` that records, for the **final** hop only, `{ status, rawHeaders, contentType, body, bodyTruncated }`. `body` is read only when `opts.body === 'html'` and the response is 2xx HTML, capped at 1 MiB, and the cap sets `bodyTruncated`. Other hops keep the existing 256 KB rule. One request per hop, no second GET. Make `MAX_BODY_BYTES` a per-call option of `createFetchHop` in `apps/api/src/inspect/fetch-hop.ts` without changing its default (makes T010 pass)
  - Done as: `createFetchHop` gained an `observe` option and returns the HTML bytes it read. In `html` mode every 2xx HTML hop reads up to 1 MiB, because a hop cannot be known to be final before its body is checked for `meta refresh`. In `none` mode the 256 KB rule is unchanged.
- [X] T021 Add `headers`, `metadata`, `tls`, `dns` and `security`, each `{ hour: 10, day: 50 }`, to `ANONYMOUS_PLAN` in `apps/api/src/quota/plans.ts`. Extend the quota tool key type in `apps/api/src/quota/types.ts` (makes T012 pass)
- [X] T022 Add to `AppDeps` in `apps/api/src/app.ts` the factories `chainFetcher()`, `tlsProber()` and `dnsQuerier()`, wired in `apps/api/src/server.ts`. In tests, inject them from `apps/api/tests/helpers.ts`. The TLS and DNS factories may throw "not implemented" until US3/US4 (they are only called by their routes)
  - Done as: only `chainFetcher()` was added. `tlsProber()` and `dnsQuerier()` are added with US3 (T060) and US4 (T072), so there are no stubs that only throw.
- [X] T023 [P] Implement `callTool(tool, body, fetchImpl?)` in `apps/web/src/lib/api.ts`, typed from the request and response schemas in `packages/contracts`, with the same `RateLimit-*` / `Retry-After` parsing as `inspect()`. Add an `unavailable` outcome for 503. Re-implement `inspect()` on top of `callTool` with no behavior change (makes T013 pass)
- [X] T024 [P] Add a "Análisis técnico" / "Technical analysis" group to the tool list on the home page and in the layout navigation, in `apps/web/src/islands/HomeIsland.vue` and `apps/web/src/layouts/Base.astro`. The group shows only the tools whose pages exist (each story adds its own entry), with es/en labels in `packages/i18n/src/{es,en}.json`
  - Done as: `apps/web/src/lib/tools.ts` lists the published tools. The `ui.tool.<id>.*` texts of the five v2 tools exist from the start, because the text types require them. `sendTargets` only offers published tools.

**Checkpoint**: base lista. Las historias US1–US4 se pueden empezar en paralelo; US5 necesita
las cuatro.

---

## Phase 3: User Story 1 - HTTP Headers (Priority: P1) 🎯 MVP de la v2

**Goal**: ver el estado y las cabeceras de la respuesta final de una URL, con la evaluación de las
cabeceras de seguridad y de las cookies, sin valores de cookies.

**Independent Test**: analizar en `/es/headers` una página conocida. Su estado y sus cabeceras
coinciden con los del servidor, en orden, y la tabla de seguridad marca bien una cabecera ausente
y una presente (quickstart, escenarios 1–5).

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T025 [P] [US1] Write unit tests for the `headers` tool in `packages/core/tests/unit/headers.test.ts`. Use synthetic `ChainObservation`s and a **synthetic criteria catalog**. Cases:
  - **Headers list**: in received order, repetitions separate; every `Set-Cookie` `value` replaced by `"<omitido>"`; the cookie value appears nowhere in the result (assert on the serialized JSON).
  - **HSTS**: missing on `https` → `missing`; `max-age` below the threshold → `misconfigured`; on `http` → `not-applicable`.
  - **CSP**: `'unsafe-inline'` in `script-src`, or in `default-src` when there is no `script-src` → `misconfigured`; `Content-Security-Policy-Report-Only` alone → `missing`, plus a finding that names report-only.
  - **Framing**: `frame-ancestors` in the CSP satisfies it without `X-Frame-Options`; `X-Frame-Options: ALLOWALL` → `misconfigured`.
  - **Other headers**: `X-Content-Type-Options` other than `nosniff`; `Referrer-Policy: unsafe-url`; missing `Permissions-Policy`.
  - **Cookies**: `CookieCheck` per cookie with `secure`, `httpOnly` and `sameSite` (`'strict' | 'lax' | 'none' | null`); `SameSite=None` without `Secure` gives a finding.
  - **Chain**: `hops` and `finalUrl` copied from the chain; `stopReason` other than `final` gives empty `headers` and an `error`; a TLS error gives `inspect.tls`.
  - **Determinism and catalog**: same input, same output; `catalogVersion` echoed from the injected catalog.
- [X] T026 [P] [US1] Write the contract test for `POST /v1/headers` in `apps/api/tests/contract/headers.test.ts`, with the existing `harness.ts`. Cases: 200 `HeadersAnalysis` validated against `packages/contracts/openapi.json`; 400 `ToolError`; 429 with `RateLimit-*` and `Retry-After`; `?lang=es` adds `text` to every `MessageRef`
  - Done as: validated against the designed contracts (001 and 002 `openapi.yaml`), like the other contract tests; `harness.ts` now resolves the 002 references to 001. The divergence test in `packages/contracts` compares the generated `openapi.json` with both.
- [X] T027 [P] [US1] Write the integration test in `apps/api/tests/integration/headers.test.ts`, against a fixture server. Cases:
  - 2 redirects then 200 with known headers: `hops: 2`, `finalUrl`, exact header order;
  - a blocked target: `stopReason: 'blocked'` with `inspect.blocked.private-address` and no connection made;
  - a self-signed HTTPS fixture from T004: `error.code: 'inspect.tls'`;
  - the trace and logs contain at most the registrable domain, never path, query, header values or cookie values.
- [X] T028 [P] [US1] Write the e2e test in `apps/web/tests/e2e/headers.spec.ts`, with the API mocked as in `inspect.spec.ts`. Cases:
  - typing and pressing "Analizar" shows status, the header table and the security table;
  - opening `#u=` does **not** call the API until the user presses "Analizar";
  - "Copiar" copies the header table as text;
  - on quota, the limit and the wait are shown and other tools stay usable;
  - the only network request is a POST with the URL in the body;
  - axe AA passes at 320 px, in light and dark mode.
  - Done as: the "Enviar a TLS" link is asserted in T053, once the TLS page exists. Here the test checks that no link points to an unpublished page.

### Implementation for User Story 1

- [X] T029 [P] [US1] Add the `headers.*` codes to `packages/core/src/codes.ts`: one per finding (e.g. `headers.hsts.missing`, `headers.hsts.short-max-age`, `headers.csp.missing`, `headers.csp.unsafe-inline`, `headers.csp.report-only`, `headers.framing.missing`, `headers.nosniff.missing`, `headers.referrer.unsafe-url`, `headers.permissions.missing`, `headers.cookie.not-secure`, `headers.cookie.not-httponly`, `headers.cookie.samesite-none-insecure`). Add their es/en texts to `packages/i18n/src/{es,en}.json`; the parity test must stay green. Add each one to `packages/rules/data/security/severities.json` and re-lock the catalog
- [X] T030 [US1] Implement `analyzeHeaders(observation, catalog)` in `packages/core/src/tools/headers/analyze.ts`, returning `HeadersAnalysis` as in [data-model.md](./data-model.md). Header parsing (CSP directives, HSTS `max-age`, cookie attributes) stays in the core. It never keeps a cookie value. All thresholds and lists come from the injected `catalog.security.headers` (makes T025 pass)
- [X] T031 [US1] Register the `headers` tool in `packages/core/src/tools/headers/index.ts` and export it from `packages/core/src/tools/index.ts`:
  - `runsOn: 'server'`;
  - `run` calls `ctx.fetchChain(url, { body: 'none' })` and then `analyzeHeaders`;
  - `sendTo: ['tls','inspect','security','explain']`;
  - share `#u=<url>`.
- [X] T032 [P] [US1] Add the `HeadersRequest` and `HeadersAnalysisSchema` Zod schemas in `packages/contracts/src/v1/headers.ts`, matching [contracts/openapi.yaml](./contracts/openapi.yaml) `HeadersAnalysis` (`sameSite` enum `strict | lax | none | null`; `state` enum `present | missing | misconfigured | not-applicable`). Export them from `packages/contracts/src/index.ts` and regenerate `packages/contracts/openapi.json` with `pnpm build:contracts`
- [X] T033 [US1] Implement `POST /v1/headers` in `apps/api/src/routes/v1/headers.ts` and register it in `apps/api/src/app.ts`. Sequence: validate, identify, `headers` quota, invoke `headersTool.run` with `fetchChain: deps.chainFetcher()` and the compiled catalog, measure, respond. The trace carries at most `url.registrable_domain`. The route has no conditionals on the meaning of the data (Principio VIII; makes T026, T027 pass)
- [X] T034 [US1] Build `apps/web/src/islands/HeadersIsland.vue` with `UrlInput`, `ResultBox`, `CopyButton`, `SendTo`, `ErrorMessage` and `InertLink` from `packages/ui`:
  - "Analizar" button; nothing is sent on load;
  - status and URL final (`InertLink`), with a "Ver cadena en Redirect Inspector" action when `hops > 0`;
  - header table, values as escaped text;
  - security table with state and explanation per header, and a cookies table without values;
  - an `inspect.tls` error offers "Enviar a TLS".

  Add es/en UI labels to `packages/i18n/src/{es,en}.json`
- [X] T035 [US1] Create `apps/web/src/pages/[lang]/headers.astro` and add HTTP Headers to the "Análisis técnico" group (T024) (makes T028 pass)
  - Done as: `/es/headers/` also added to `apps/web/lighthouserc.json`.

**Checkpoint**: HTTP Headers funciona de principio a fin. Es el primer lanzamiento posible de la
v2.

---

## Phase 4: User Story 2 - Metadata (Priority: P2)

**Goal**: ver qué título, descripción e imagen mostrará una vista previa, con los metadatos por
origen y avisos de lo que falta, sin que el navegador cargue recursos de terceros.

**Independent Test**: analizar una página con Open Graph conocido. Título, descripción, imagen y
URL canónica coinciden con el documento, y el panel de red no muestra ninguna petición hacia la
imagen (quickstart, escenarios 6–7).

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T036 [P] [US2] Write unit tests for encoding detection in `packages/core/tests/unit/metadata-encoding.test.ts`. Cases:
  - a UTF-8 BOM wins over everything;
  - the `Content-Type` charset wins over `<meta charset>`;
  - `<meta charset>` and `<meta http-equiv="content-type">` are found only within the first 1024 bytes;
  - with no declaration, the result is `windows-1252` with `source: 'default'`;
  - an unknown label falls back to the default and adds `metadata.unknown-encoding`;
  - a `windows-1252` document with `é` and a `Shift_JIS` document decode correctly.
- [X] T037 [P] [US2] Write unit tests for `extractMetadata` in `packages/core/tests/unit/metadata.test.ts`, with synthetic documents and a synthetic precedence catalog. Cases:
  - **Extraction**: title, description, `og:*` (repeated `og:image` kept as a list), `twitter:*`, canonical, icons, `alternate` + `hreflang`, `<html lang>`; `<meta>` placed after `<body>` still found, as the HTML standard places it.
  - **Values**: relative URLs resolved against `finalUrl`; `effective` follows the precedence and records `from`.
  - **Warnings**: `metadata.missing-title`, `metadata.missing-image`, `metadata.canonical-cross-domain` (other registrable domain), `metadata.image-relative`, `metadata.truncated` when `bodyTruncated`, `metadata.not-html` for non-HTML content types.
  - **Safety**: `<script>` contents are never interpreted; values with markup and `javascript:` / `data:` URLs are returned as plain text.
  - **Determinism**: same input, same output.
- [X] T038 [P] [US2] Write the contract test for `POST /v1/metadata` in `apps/api/tests/contract/metadata.test.ts`: 200 `PageMetadata`, 400, 429, `?lang`
- [X] T039 [P] [US2] Write the integration test in `apps/api/tests/integration/metadata.test.ts`, against fixture servers. Cases:
  - a page with Open Graph;
  - a 2 MiB page: `truncated: true`, with the tags inside the first 1 MiB still found;
  - an `application/pdf` response;
  - a page that redirects once before the HTML.
- [X] T040 [P] [US2] Write the e2e test in `apps/web/tests/e2e/metadata.spec.ts`, with the API mocked. Cases:
  - the result shows the effective preview fields and the sources grouped by origin;
  - `og:image` and icons appear as text through `InertLink`, and the page contains **no** `<img>` or `<link>` pointing to them (assert in the DOM and in the request log);
  - "Copiar" works;
  - axe AA passes at 320 px.

### Implementation for User Story 2

- [X] T041 [P] [US2] Add the `metadata.*` codes to `packages/core/src/codes.ts` (`metadata.missing-title`, `metadata.missing-description`, `metadata.missing-image`, `metadata.canonical-cross-domain`, `metadata.image-relative`, `metadata.truncated`, `metadata.not-html`, `metadata.unknown-encoding`). Add their es/en texts in `packages/i18n/src/{es,en}.json` and their severities in `packages/rules/data/security/severities.json`, then re-lock
  - Done as: no severities for `metadata.*`. They are preview warnings, and Security Analysis never turns them into findings (R7), so `severities.json` has nothing to grade.
- [X] T042 [US2] Implement `sniffEncoding(bytes, contentType)` and `decode(bytes, label)` in `packages/core/src/tools/metadata/encoding.ts`. Follow the HTML standard order (BOM, transport-layer charset, prescan of the first 1024 bytes, default `windows-1252`) and use `TextDecoder` (makes T036 pass)
- [X] T043 [US2] Implement `extractMetadata(observation, catalog)` in `packages/core/src/tools/metadata/extract.ts` with `parse5`. Only `parse` is used and nothing is executed. It returns `PageMetadata` as in [data-model.md](./data-model.md). The precedence comes from `catalog.metadata.precedence` (makes T037 pass)
  - Done as: the parser is **injected**. `parse5` stays a dependency of the core, used only by `packages/core/src/tools/metadata/html.ts` (published as `@urlkit/core/html`). The API passes it as `ToolContext.parseHtml`. The web loads the tool registry, so importing `parse5` from the tool would put it on every page; `extract.ts` walks a structural `HtmlNode` instead.
- [X] T044 [US2] Register the `metadata` tool in `packages/core/src/tools/metadata/index.ts` and export it from `packages/core/src/tools/index.ts`:
  - `runsOn: 'server'`;
  - `run` calls `ctx.fetchChain(url, { body: 'html' })` and then `extractMetadata`;
  - `sendTo: ['headers','inspect','clean','security']`;
  - share `#u=<url>`.

  Confirm with `pnpm size` that no web page bundle includes `parse5`
  - Done: `pnpm size` 128.44 KB, and no file in `apps/web/dist/_astro` contains `parse5`.
- [X] T045 [P] [US2] Add the `MetadataRequest` and `PageMetadataSchema` Zod schemas in `packages/contracts/src/v1/metadata.ts`, matching [contracts/openapi.yaml](./contracts/openapi.yaml) (`encoding.source` enum `bom | header | meta | default`; `EffectiveValue.from` enum `openGraph | twitter | basic`). Export them and regenerate `openapi.json`
- [X] T046 [US2] Implement `POST /v1/metadata` in `apps/api/src/routes/v1/metadata.ts` and register it in `apps/api/src/app.ts`, with the same sequence as T033 and the `metadata` quota (makes T038, T039 pass)
- [X] T047 [US2] Build `apps/web/src/islands/MetadataIsland.vue`:
  - a preview block with the effective title, description, site and image URL (text only, `InertLink`), each with its source;
  - a sources table grouped by origin, and the warnings;
  - the detected encoding and the truncation notice.

  Add es/en labels to `packages/i18n/src/{es,en}.json`
- [X] T048 [US2] Create `apps/web/src/pages/[lang]/metadata.astro` and add Metadata to the "Análisis técnico" group (makes T040 pass)
  - Done as: `/es/metadata/` also added to `apps/web/lighthouserc.json`.

**Checkpoint**: Metadata funciona por separado y reutiliza la cadena de US1 sin cambiarla.

---

## Phase 5: User Story 3 - TLS (Priority: P3)

**Goal**: revisar el certificado y la conexión segura de un sitio, también cuando el certificado
no es válido.

**Independent Test**: analizar un host válido y otro con certificado caducado. El primero sale
`trusted`; el segundo, `tls.expired` con su fecha y la cadena recibida a la vista (quickstart,
escenarios 8–9).

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T049 [P] [US3] Write unit tests for the `tls` tool in `packages/core/tests/unit/tls.test.ts`, with synthetic `TlsObservation`s and criteria. Cases:
  - **Problems from `authorizationError`**:

    | `authorizationError` | Problem |
    |---|---|
    | `CERT_HAS_EXPIRED` | `tls.expired` |
    | `CERT_NOT_YET_VALID` | `tls.not-yet-valid` |
    | `DEPTH_ZERO_SELF_SIGNED_CERT` / `SELF_SIGNED_CERT_IN_CHAIN` | `tls.self-signed` |
    | `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` / `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | `tls.incomplete-chain` |
    | any other | `tls.untrusted-root` |

  - **Checks without an OpenSSL error**: `hostMatches: false` → `tls.name-mismatch`; `daysRemaining` computed from `observedAt` (negative when expired); `tls.expiring-soon` with `params.days` below the catalog threshold, even when `authorized: true`; `tls.weak-signature` for `sha1`; `tls.legacy-protocol` for `TLSv1.1`.
  - **Result fields**: `trust` is `trusted` only when `authorized` and no name mismatch; `transparency` copied from the leaf; `sniSent: false` passed through for IP literals.
  - **Blocked observation**: gives `blocked` and empty `chain`.
  - **No clock**: the result is the same for the same `observedAt`, and the test fails if the code reads `Date.now()` (inject a throwing clock through `vi.useFakeTimers` and assert).
- [X] T050 [P] [US3] Write the integration test for the TLS connector in `apps/api/tests/integration/tls.test.ts`, against a local `tls.createServer` serving each certificate from T004. Cases:
  - for each one, the observation has the expected `authorized` / `authorizationError`, the chain from leaf to root and `hostMatches`;
  - the handshake completes even for invalid certificates (`rejectUnauthorized: false`);
  - no application data is written;
  - the socket is closed;
  - a 5 s timeout gives `tls.timeout`;
  - a plain-TCP server gives `tls.no-tls`;
  - the SCT fixture gives `sct: { status: 'embedded', count: 1 }`, and a leaf without the extension gives `absent`.
- [X] T051 [P] [US3] Add the TLS connector to the `CONNECTORS` list of `apps/api/tests/ssrf/ssrf.test.ts` (T011). Every vector must be blocked before any socket is opened, also on the TLS port policy (443 by default and the URL port only if in `DEFAULT_PORTS`)
  - Done as: TLS sends no URL and follows no redirect, so it runs the 71 vectors about the connection itself: the allowed ones, and those blocked at hop 0 by address, port or resolution. Credential, scheme and redirect vectors stay with `safeFetch`. A fake socket records each address and refuses the connection.
- [X] T052 [P] [US3] Write the contract test for `POST /v1/tls` in `apps/api/tests/contract/tls.test.ts`: 200 `TlsAnalysis` (incl. a `blocked` result), 400 for an empty or invalid `target`, 429, `?lang`
- [X] T053 [P] [US3] Write the e2e test in `apps/web/tests/e2e/tls.spec.ts`, with the API mocked. Cases:
  - the chain is shown from leaf to root, with dates and days remaining;
  - each problem is shown with its explanation;
  - an expired certificate is visible, not hidden behind an error;
  - "Enviar a DNS" and "Enviar a HTTP Headers" carry the input;
  - axe AA passes at 320 px.
  - Done as: the "Revisar el certificado en TLS" link of HTTP Headers is asserted here too. `sendTargets` now gives `{ target }` to TLS and DNS.

### Implementation for User Story 3

- [X] T054 [P] [US3] Add the `tls.*` codes to `packages/core/src/codes.ts` (`tls.expired`, `tls.not-yet-valid`, `tls.self-signed`, `tls.name-mismatch`, `tls.incomplete-chain`, `tls.untrusted-root`, `tls.expiring-soon`, `tls.weak-signature`, `tls.legacy-protocol`, `tls.timeout`, `tls.refused`, `tls.no-tls`, `tls.handshake-failed`). Add es/en texts and severities, then re-lock the catalog
  - Done as: severities `high` for expired, not yet valid, self-signed, name mismatch and untrusted root; `medium` for incomplete chain, weak signature, legacy protocol and no TLS; `low` for expiring soon; `info` for connection failures.
- [X] T055 [US3] Implement `analyzeTls(observation, catalog)` in `packages/core/src/tools/tls/analyze.ts`, returning `TlsAnalysis` as in [data-model.md](./data-model.md). The `authorizationError` → problem mapping lives here, not in the connector (makes T049 pass)
- [X] T056 [US3] Implement the connector in `apps/api/src/probes/tls/connect.ts`:
  - **Target**: `analyzeHost` gives the target; `resolveTarget` and `DEFAULT_POLICY` are imported from `apps/api/src/inspect/ssrf.ts`, with no copied rule.
  - **Connection**: `tls.connect({ host: validatedIp, port, servername: kind === 'name' ? ascii : undefined, rejectUnauthorized: false, ALPNProtocols: ['h2','http/1.1'] })` with a 5 s timeout.
  - **Observation**: built from `getProtocol()`, `getCipher()`, `alpnProtocol`, `authorized`, `authorizationError`, `X509Certificate.checkHost` / `checkIP` and the `getPeerCertificate(true)` chain walk, converted to `X509Certificate`. It stops when `issuerCertificate` is itself.
  - **Close**: on the `secureConnect` event, with no application data written.
  - **Errors**: `ECONNREFUSED` → `tls.refused`; timeout → `tls.timeout`; handshake on a non-TLS port → `tls.no-tls`; others → `tls.handshake-failed`.

  Makes T050, T051 pass
  - Done as: Node's own name check is disabled (`checkServerIdentity: () => undefined`), so `authorized` reflects only the chain and the name is reported apart in `hostMatches`. A `ca` option overrides the trust store, for tests only.
- [X] T057 [US3] Implement `readSct(der)` in `apps/api/src/probes/tls/x509.ts` with `@peculiar/asn1-schema` and `@peculiar/asn1-x509`. It parses the leaf's `TBSCertificate.extensions`, finds OID `1.3.6.1.4.1.11129.2.4.2` and counts the SCTs in its `SignedCertificateTimestampList`. It returns `'embedded' | 'absent' | 'unknown'` (`unknown` on parse failure, never throws). Wire it into `connect.ts` (makes the SCT case of T050 pass; research R5)
- [X] T058 [US3] Register the `tls` tool in `packages/core/src/tools/tls/index.ts` and export it:
  - `runsOn: 'server'`;
  - `run` calls `analyzeHost`, then `ctx.probeTls`, then `analyzeTls`;
  - `sendTo: ['headers','dns','security']`;
  - share `#u=<target>`.
- [X] T059 [P] [US3] Add the `TlsRequest` (`target`: string, 1–32000) and `TlsAnalysisSchema` Zod schemas in `packages/contracts/src/v1/tls.ts`, matching [contracts/openapi.yaml](./contracts/openapi.yaml) (`trust` enum `trusted | untrusted`; `transparency.status` enum `embedded | absent | unknown`; `host` as `{unicode, ascii}` or `{ip}`). Export them and regenerate `openapi.json`
  - Done as: the designed contract (`contracts/openapi.yaml`) now marks `host`, `protocol`, `cipher`, `alpn` and `transparency` as required in `TlsAnalysis`, because the API always returns them.
- [X] T060 [US3] Wire `tlsProber()` in `apps/api/src/server.ts`. Implement `POST /v1/tls` in `apps/api/src/routes/v1/tls.ts` with the T033 sequence and the `tls` quota, and register it in `apps/api/src/app.ts`. The trace adds `tls.protocol` and never certificate fields (makes T052 pass)
  - Done as: `tls.protocol` added to the trace attribute allowlist in `apps/api/src/observability/tracing.ts`; otherwise it would be silently dropped.
- [X] T061 [US3] Build `apps/web/src/islands/TlsIsland.vue`:
  - a trust summary and the list of problems;
  - one card per certificate in the chain (subject, issuer, names, dates, days remaining, signature, fingerprint with "Copiar");
  - protocol, cipher and ALPN;
  - transparency, with the note that only embedded SCTs are checked.

  Add es/en labels
- [X] T062 [US3] Create `apps/web/src/pages/[lang]/tls.astro` and add TLS to the "Análisis técnico" group (makes T053 pass)
  - Done as: `/es/tls/` also added to `apps/web/lighthouserc.json`.

**Checkpoint**: TLS funciona por separado, y los vectores SSRF se ejecutan contra sus dos
conectores.

---

## Phase 6: User Story 4 - DNS (Priority: P4)

**Goal**: ver los registros DNS de un dominio con su TTL y su estado DNSSEC, distinguiendo "no
existe", "sin registros" y "fallo".

**Independent Test**: consultar un dominio con registros conocidos y comprobar los tipos, los
valores y el estado DNSSEC; un dominio que no existe sale `nxdomain` (quickstart, escenarios
10–12).

### Tests for User Story 4 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T063 [P] [US4] Write unit tests for the `dns` tool in `packages/core/tests/unit/dns.test.ts`, with synthetic `DnsObservation`s. Cases:
  - **DNSSEC state**: AD set → `validated`; AD clear → `unsigned`; `SERVFAIL` + EDE 1–12 → `bogus`; `SERVFAIL` without EDE but `retriedWithCd.rcode === 'NOERROR'` → `bogus`; `SERVFAIL` otherwise → `outcome: 'failed'`, `dnssec: 'unknown'`.
  - **Outcome and per-type state**: `NXDOMAIN` → `outcome: 'nxdomain'`; `NOERROR` with no records → that type `state: 'empty'`; a transport error on one type → that type `failed`, the rest unaffected.
  - **Records**: TXT fragments joined; MX `{ priority, exchange }`; CAA `{ flags, tag, value }`; SOA fields; TTL kept per record.
  - **Warnings**: `dns.no-caa`, `dns.no-spf` (no TXT starting with `v=spf1`), `dns.no-dmarc` (no `_dmarc` TXT).
  - **Names**: `alternative` is the registrable domain when the host differs, and `null` otherwise; `name` comes in Unicode and ASCII.
  - **Determinism**: same input, same output.
- [X] T064 [P] [US4] Write the integration test for the DoH client in `apps/api/tests/integration/dns.test.ts`, against a local fake DoH server that serves the T005 fixtures. Cases:
  - **Request**: `POST` with `content-type: application/dns-message`, RD and EDNS(0) with DO set in every query; the 8 types queried in parallel.
  - **Fallback**: the CD retry happens only after `SERVFAIL`; the fallback resolver is used only on a transport error (and not on `NXDOMAIN` or `SERVFAIL`); `resolver` reports which one answered.
  - **Timeouts**: 3 s per query and 5 s overall; both resolvers down → `dns.unavailable`.
  - **Resolver addresses**: a separate test asserts that the configured resolver IPs pass `isBlockedAddress` as public.
  - Done as: the first query (A) chooses the resolver. A transport error there moves the whole lookup to the fallback, so the result names a single resolver. A later transport error on one type marks only that type as `transportError`.
- [X] T065 [P] [US4] Write the contract test for `POST /v1/dns` in `apps/api/tests/contract/dns.test.ts`. Cases: 200 `DnsLookup`; `scope` enum `host | registrable` (default `host`); 400 for `dns.ip-literal` and `dns.special-use`; 429; 503 `ToolError` with `dns.unavailable` that does **not** consume quota; `?lang`
- [X] T066 [P] [US4] Write the e2e test in `apps/web/tests/e2e/dns.spec.ts`, with the API mocked. Cases:
  - records grouped by type with TTL;
  - the DNSSEC state and the resolver;
  - the "Consultar también `example.com`" action switches `scope` and updates `#u=…&t=registrable`;
  - `nxdomain` and `failed` are visibly different;
  - long TXT records wrap without horizontal scroll at 320 px;
  - axe AA passes.

### Implementation for User Story 4

- [X] T067 [P] [US4] Add the `dns.*` codes to `packages/core/src/codes.ts` (`dns.nxdomain`, `dns.failed`, `dns.unavailable`, `dns.bogus`, `dns.unsigned`, `dns.no-caa`, `dns.no-spf`, `dns.no-dmarc`; `dns.ip-literal` and `dns.special-use` already exist from T016). Add es/en texts and severities, then re-lock the catalog
  - Done as: `dns.unavailable` is also a `ToolError` code (`ERROR_CODES`). Severities: `high` for `nxdomain` and `bogus`; `low` for `unsigned`, `no-caa`, `no-spf` and `no-dmarc`; `info` for `failed`.
- [X] T068 [US4] Implement `analyzeDns(observation, name)` in `packages/core/src/tools/dns/analyze.ts`, returning `DnsLookup` as in [data-model.md](./data-model.md) (`outcome` enum `exists | nxdomain | failed`; `dnssec` enum `validated | unsigned | bogus | unknown`) (makes T063 pass)
  - Done as: `dns.no-caa`, `dns.no-spf` and `dns.no-dmarc` are only checked when the registrable domain itself is queried. CAA is inherited from the parent and mail records belong to the domain, so on a subdomain they would be false alarms. Record data is typed as `DnsRecordData`.
- [X] T069 [US4] Implement the DoH client in `apps/api/src/probes/dns/doh.ts`:
  - **Configuration**: two fixed resolvers, `cloudflare` (`1.1.1.1`, servername `cloudflare-dns.com`) and `quad9` (`9.9.9.9`, servername `dns.quad9.net`), in a constant that is not configurable per request.
  - **Queries**: encoded and decoded with `dns-packet`, over `undici` with an explicit dispatcher (no env proxy); RD and EDNS(0) with the DO bit; EDE (option 15) decoded into `{ code, text }`.
  - **Retries**: a CD retry after `SERVFAIL`; the fallback resolver only on a transport error.
  - **Timeouts**: 3 s per query and 5 s overall.
  - **Extra query**: the `_dmarc.<registrable>` TXT for the DMARC warning.

  Makes T064 pass; research R6
  - Done as: requests go to the resolver's own https URL, with undici's `lookup` pinned to its fixed address, so its certificate is verified as usual. `probes/dns/doh.ts` is listed in the SSRF suite as a fixed-destination module.
- [X] T070 [US4] Register the `dns` tool in `packages/core/src/tools/dns/index.ts` and export it:
  - `runsOn: 'server'`;
  - `run` calls `analyzeHost` (rejecting `kind: 'ip'` and special-use names before any query), picks the name by `scope`, then calls `ctx.queryDns` and `analyzeDns`;
  - `sendTo: ['tls','headers','security']`;
  - share `#u=<target>&t=host|registrable`.
- [X] T071 [P] [US4] Add the `DnsRequest` (`target`, `scope` default `host`) and `DnsLookupSchema` Zod schemas in `packages/contracts/src/v1/dns.ts`, matching [contracts/openapi.yaml](./contracts/openapi.yaml), with the 503 response declared. Export them and regenerate `openapi.json`
- [X] T072 [US4] Wire `dnsQuerier()` in `apps/api/src/server.ts`. Implement `POST /v1/dns` in `apps/api/src/routes/v1/dns.ts` with the T033 sequence and the `dns` quota. `dns.unavailable` maps to 503 and refunds the quota use. Register it in `apps/api/src/app.ts`. Read `apps/api/src/quota/limiter.ts` first: if it has no refund operation, add the smallest one possible there, with its own test in `apps/api/tests/integration/quota.test.ts` (makes T065 pass)
  - Done as: `QuotaStore.decrement` is optional, so existing test stores stay valid. `MemoryStore` and `RedisStore` implement it; the Redis one is a Lua `GET`/`DECR` that never creates a key or touches its TTL. `Limiter.refund` uses it, and it is tested against real Valkey in `tests/integration/valkey.test.ts`.
- [X] T073 [US4] Build `apps/web/src/islands/DnsIsland.vue`:
  - a summary with outcome, DNSSEC and resolver;
  - one section per record type with its TTL and "Copiar";
  - the alternative-name action;
  - the configuration warnings.

  Add es/en labels
- [X] T074 [US4] Create `apps/web/src/pages/[lang]/dns.astro` and add DNS to the "Análisis técnico" group (makes T066 pass)
  - Done as: `/es/dns/` also added to `apps/web/lighthouserc.json`.

**Checkpoint**: DNS funciona por separado. Las cuatro herramientas de detalle están completas.

---

## Phase 7: User Story 5 - Security Analysis (Priority: P5)

**Goal**: una sola vista con los hallazgos técnicos de seguridad de un enlace, ordenados por
gravedad y enlazados a su herramienta. Sin nota ni veredicto, y diciendo siempre qué no se
comprueba.

**Independent Test**: analizar un enlace de prueba con una redirección de `https` a `http`, una
cabecera ausente y un certificado que caduca pronto. Aparecen los tres, ordenados por gravedad y
enlazados (quickstart, escenarios 13–14).

**Depends on**: US1–US4 (usa sus funciones puras y sus sondas).

### Tests for User Story 5 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T075 [P] [US5] Write unit tests for `reviewTargets(input, chain)` in `packages/core/tests/unit/security-targets.test.ts`. Cases:
  - TLS and headers target the **final** URL when it is `https`;
  - TLS is `skipped` for an `http` final URL;
  - DNS targets the final host and its registrable domain;
  - a blocked input skips every network part, with the block reason;
  - a chain that never reaches a response marks headers, TLS and DNS according to the stop reason.
  - Done as: DNS is checked on the destination's registrable domain (`scope: 'registrable'`), which carries DNSSEC, CAA, SPF and DMARC, rather than on both host and domain. When the chain stops at a certificate error, TLS is checked on that hop.
- [X] T076 [P] [US5] Write unit tests for `review(parts, catalog)` in `packages/core/tests/unit/security-review.test.ts`, with synthetic part results and a synthetic severities catalog. Cases:
  - **Mapping**: every finding has `code`, `severity`, `tool` and `params`; Explain URL `caution` maps to `medium` unless the catalog says otherwise; `https-downgrade` and `domain-change` hop flags become findings.
  - **Order**: by severity `high → medium → low → info`, then by the fixed tool order `explain → inspect → headers → tls → dns`.
  - **Partial results**: a missing part becomes `incomplete` with `security.part-timeout` or its error code, and the others are still reviewed.
  - **Scope**: `scope.notChecked` always contains `reputation` and `content`.
  - **No score**: the serialized result has **no** field named `score`, `grade`, `rating` or `verdict` (FR-064).
  - **Determinism**: same input, same output.
  - Done as: the no-score check looks at field names, not substrings: `security.hop.https-downgrade` contains "grade".
- [X] T077 [P] [US5] Write the integration test in `apps/api/tests/integration/security.test.ts`, with fixture servers and the fake DoH. Cases:
  - **Full run**: one request uses exactly **one** `security` quota unit and zero units of `inspect`, `headers`, `tls` and `dns` (FR-065).
  - **Budgets**: the chain plus headers get 6 s, then TLS and DNS run in parallel with 4 s; the overall deadline is 10 s.
  - **Partial result**: with the fake DoH stopped, `parts.dns.state: 'incomplete'` and the rest complete.
  - **Blocked input**: no socket is opened, and only Explain URL findings plus the block finding are returned.
- [X] T078 [P] [US5] Write the contract test for `POST /v1/security` in `apps/api/tests/contract/security.test.ts`. Cases: 200 `SecurityReview` (with `additionalProperties: false` enforced, so a score field would fail validation); 400; 429; `?lang` adds `text` to every finding
- [X] T079 [P] [US5] Write the e2e test in `apps/web/tests/e2e/security.spec.ts`, with the API mocked. Cases:
  - findings are grouped by severity, each with its explanation and a link to the detail tool carrying `#u=`;
  - the "Qué no se ha comprobado" block is always visible right below the findings;
  - incomplete parts are named, with the reason;
  - no score, grade or "safe" label appears anywhere on the page;
  - axe AA passes at 320 px.

### Implementation for User Story 5

- [X] T080 [P] [US5] Add the `security.*` codes to `packages/core/src/codes.ts` (`security.part-timeout`, `security.part-failed`, `security.part-skipped`, `security.hop.https-downgrade`, `security.hop.domain-change`, `security.not-checked.reputation`, `security.not-checked.content`). Add es/en texts and the severities of the hop findings, then re-lock the catalog
  - Done as: `security.part-timeout` and `security.part-failed` were not created. An incomplete part carries the code of what failed (`inspect.timeout`, `tls.timeout`, `dns.unavailable`), and a published code is contract, so codes nothing emits are not added. `inspect.blocked.*` got severity `medium` and `security.hop.domain-change` `info`.
- [X] T081 [US5] Implement `reviewTargets` in `packages/core/src/tools/security/targets.ts` (makes T075 pass)
- [X] T082 [US5] Implement `review(parts, catalog)` in `packages/core/src/tools/security/review.ts`, returning `SecurityReview` as in [data-model.md](./data-model.md). It reuses `explain`, `analyzeHeaders`, `analyzeTls` and `analyzeDns` outputs as inputs and adds no network rules of its own (makes T076 pass)
- [X] T083 [US5] Register the `security` tool in `packages/core/src/tools/security/index.ts` and export it:
  - `runsOn: 'server'`;
  - `run` follows this order: explain → `ctx.fetchChain(url, { body: 'none' })` → `reviewTargets` → `ctx.probeTls` ∥ `ctx.queryDns` → `review`;
  - it calls the adapters directly, never other tools through the registry;
  - `sendTo: ['explain','inspect','headers','tls','dns']`;
  - share `#u=<url>`.
  - Done as: the tool also rejects non-http(s) URLs with `url.unsupported-scheme` right after Explain URL, which accepts any scheme.
- [X] T084 [US5] Add per-part time budgets to the `security` adapters in `apps/api/src/probes/security.ts`: 6 s for the chain, 4 s for TLS ∥ DNS and 10 s overall, with `AbortSignal.timeout`. A part that runs out resolves to a timed-out observation instead of rejecting, so the core can mark it `incomplete` (research R7)
  - Done as: `createSecurityAdapters` builds the usual chain, TLS and DoH adapters with the budgets as their own timeouts (chain 6 s, TLS and DNS 4 s). No extra wrapper is needed, because each adapter already turns its timeout into an observation.
- [X] T085 [P] [US5] Add the `SecurityRequest` and `SecurityReviewSchema` Zod schemas (`.strict()`, no score field; `scope.notChecked` with `min(1)`) and `FindingSchema` in `packages/contracts/src/v1/security.ts`, matching [contracts/openapi.yaml](./contracts/openapi.yaml). Export them and regenerate `openapi.json`
- [X] T086 [US5] Implement `POST /v1/security` in `apps/api/src/routes/v1/security.ts` with the T033 sequence and the `security` quota, injecting the three budgeted adapters from T084. Register it in `apps/api/src/app.ts` (makes T077, T078 pass)
  - Done as: `AppDeps.securityAdapters()` provides the three budgeted adapters; tests inject short budgets.
- [X] T087 [US5] Build `apps/web/src/islands/SecurityIsland.vue`:
  - findings grouped under severity headings, each with its explanation and a "Ver detalle" link to its tool;
  - the parts status (complete, incomplete, skipped, with the reason);
  - a fixed "Qué no se ha comprobado" block listing reputation and content;
  - wording reviewed so that nothing reads as a verdict.

  Add es/en labels
- [X] T088 [US5] Create `apps/web/src/pages/[lang]/security.astro` and add Security Analysis to the "Análisis técnico" group (makes T079 pass)
  - Done as: `/es/security/` also added to `apps/web/lighthouserc.json`. With every v2 page published, the link check in `headers.spec.ts` now asserts that every `/es/…` link goes to an existing page.

**Checkpoint**: las cinco herramientas de la v2 están completas.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: navegación entre las diez herramientas, documentación, privacidad y validación contra
la red real

- [X] T089 [P] Extend `apps/web/tests/e2e/navigation.spec.ts`. Run Headers → "Enviar a TLS" → "Enviar a DNS" → "Enviar a Security Analysis": the same input arrives at each step, and no network tool sends a request on arrival. Check that Redirect Inspector's and Explain URL's "Enviar a" now include the new targets
- [X] T090 Add the new `sendTo` targets to the MVP tools (`inspect`: + `headers`, `security`; `explain`: + `security`) in `packages/core/src/tools/inspect/index.ts` and `packages/core/src/tools/explain/index.ts`. Make the existing `SendTo` component and `packages/core/src/tools/suggest.ts` aware of the new ids, if they enumerate tools (makes T089 pass; [contracts/tool-registry.md](./contracts/tool-registry.md), "sendTo")
  - Done as: `SendTo` and `suggest.ts` do not enumerate tools, so nothing changed there. `sendTargets` already only offers published pages.
- [X] T091 [P] Extend `apps/web/tests/e2e/privacy.spec.ts` to the five new pages. Each analysis makes exactly one request (the API POST, URL in the body). There are no requests to third-party hosts, including `og:image` and icons. There are no cookies
- [X] T092 [P] Extend `apps/api/tests/integration/privacy.test.ts` and `apps/api/tests/integration/observability.test.ts` to the five new endpoints. Logs, traces and the error scrubber never contain:
  - the input URL, path or query;
  - header values or cookie names and values;
  - document content;
  - certificate subjects;
  - DNS record data.

  At most the registrable domain appears (FR-002, SC-009)
  - Done as: the API endpoints are fed observations full of marker values (header value, cookie, document, certificate subject, DNS data); none reaches the logs. The trace allowlist test checks that `tls.protocol` is kept and certificate, DNS and header fields are dropped.
- [X] T093 [P] Update `docs/privacidad.md`. Say what reaches the server for each of the five tools; that the DoH resolvers (Cloudflare and Quad9) see the queried name coming from the server's IP, never the visitor's; that cookie values are never returned; and that the web never loads preview images. Update the header date and replace the "v2" bullet of "Qué cambiará en las próximas versiones" with the current state
- [X] T094 [P] Update `CLAUDE.md`, editing only the affected sentences and keeping the person's uncommitted edits:
  - the "Estado actual" section gets the v2 status;
  - the architecture paragraph and the "Lo que todavía no existe" entry for `services/probes/` say it is no longer planned for v2 and that §11 was evaluated and closed (research R1).
  - Done as: the person's uncommitted edit of `CLAUDE.md` (the `main` branch sentence) was kept as is.
- [X] T095 [P] Update the "fuera de alcance" tree and the `tests/ssrf-vectors/` paragraph in `specs/001-mvp-url-toolkit/plan.md`: `services/probes/` and `tests/contract/` are no longer v2, and the vectors are run by the two `apps/api` connectors (research R1, R11). Do not touch anything else in that file
- [X] T096 Write the reference-set script `apps/api/scripts/reference-check.ts`, outside CI. It runs the five tools against the real network:
  - ≥ 50 sites for SC-003, comparing with `curl -sI` output;
  - ≥ 50 pages with known metadata for SC-004;
  - the `badssl.com` hosts for SC-005;
  - signed, unsigned and `dnssec-failed.org` domains for SC-006.

  Write the results to `specs/002-v2-network-analysis/validation/reference-sets.md`, with the date and the pass rate per criterion
  - Done as: SC-003 46/49 after fixing two Redirect Inspector bugs from the MVP it uncovered (an HTML attribute taken for a JavaScript redirect, and an entity-encoded `meta refresh` inside `<noscript>`); the remaining differences are explained in `validation/reference-sets.md`; SC-005 6/6; SC-006 7/7. SC-004: 200/200 on the 2026-11-12 snapshots, with expected values from an independent Python extractor and Claude's review of the differences (not yet a human review; a sample is still due). The manual half of SC-003: 411/412 (99.8 %) with the same method; it found two header-evaluation bugs (`X-Frame-Options` with repeated identical values, and `strict-dynamic` not ignoring host and scheme sources), now fixed; re-evaluated on the same snapshots, 412/412. The first run found a v2 bug, now fixed: HTTP/2 headers arrive as an object and the list came back empty (`headerPairs`).
- [X] T097 Run `pnpm lint`, `pnpm typecheck`, `pnpm boundaries`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm size` and `pnpm lhci`, and fix any failure. Confirm that `parse5` is absent from every web bundle and that the five new pages meet the 150 KB / < 1 s budgets. Record the run in `specs/002-v2-network-analysis/validation/quality-gates.md`
- [X] T098 Run the [quickstart.md](./quickstart.md) manual scenarios 1–15 and its privacy checks against `pnpm dev`. Record the results in `specs/002-v2-network-analysis/validation/quickstart.md`
  - Done as: scenarios 1–13 run against a local API on port 8788 (the MVP container holds 8787); 14 and 15 are covered by automated tests. Scenario 13 found a Security Analysis gap, now fixed: an incomplete part keeps what was observed, so the findings of hops seen before a timeout are not lost (FR-062).
- [X] T098a Measure SC-001 (95 % of HTTP Headers, Metadata, TLS and DNS analyses finish in under 5 s; 95 % of Security Analysis analyses in under 10 s):
  - add a `--timing` option to `apps/api/scripts/reference-check.ts` that times each call end to end (request sent to response received) over the SC-003 site list, at least 50 targets per tool, and reports the p95 per tool. It stays outside CI;
  - run it against a local API (`pnpm dev` or the `selfhosted` profile) and record the date, the place it ran from, the p95 per tool and the slowest targets in `specs/002-v2-network-analysis/validation/reference-sets.md`, in a new "SC-001" section;
  - a local run shows whether the budget is plausible; the figure that counts comes from production, so repeat it against the production API as part of 001/T113 and record both.
  - Done as: local run on 2026-11-12, 50 targets per tool through `PORT=8788 TRUST_PROXY=1` (a different documentation-range client IP per request, so the quota does not stop the run). Under budget: headers, metadata, TLS and Security Analysis 49/50 (98 %), DNS 50/50; p95 between 0.29 s and 1.91 s. The only target over budget is `www.gnu.org`, which does not answer and waits out the probe limits (the same site SC-003 explains). The production figure is part of 001/T113, with `--limit 10` because the quota applies behind Caddy.
- [ ] T098b Run a usability check for SC-007 (≥ 90 % of non-technical participants identify, after using Security Analysis, the most serious problem of a test link and understand what was not checked) and record the protocol and results in `specs/002-v2-network-analysis/validation/usability.md`:
  - same format as `specs/001-mvp-url-toolkit/validation/usability.md`: participants, material at 360 px and on a laptop, tasks without the moderator's help, a record per participant, and the success threshold;
  - test links with a known most serious finding, chosen so that it is stable over time (for example quickstart scenario 13, the `https` → `http` downgrade), and two questions per link: "¿cuál es el problema más grave?" and "¿qué no ha comprobado la herramienta?" (the answer must mention reputation or content, `scope.notChecked`);
  - before the session, rehearse every link in `/es/security` and `/en/security` and record what each one shows, as was done for 001/T103;
  - it can share the session and the participants with 001/T103.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. T001 goes first: the architecture decision is documented
  before any code
- **Foundational (Phase 2)**: depends on Setup and BLOCKS all user stories
- **US1–US4 (Phases 3–6)**: depend on Foundational and are independent of each other
- **US5 (Phase 7)**: depends on US1–US4
- **Polish (Phase 8)**: depends on the stories it covers. T096–T098b come last. T098b needs
  people, like 001/T103, and T098a's production figure needs the deployment (001/T113)

### User Story Dependencies

- **US1 HTTP Headers (P1)**: after Foundational; no other story needed
- **US2 Metadata (P2)**: after Foundational. It uses the chain probe (T020), not US1 code
- **US3 TLS (P3)**: after Foundational; independent. US1's `inspect.tls` error links to `/tls`,
  but its tests mock that page
- **US4 DNS (P4)**: after Foundational; independent
- **US5 Security Analysis (P5)**: after US1–US4

### Within Each User Story

- Tests first and failing → codes, texts and severities → core tool → registration → contract
  schemas → probe or connector → route → island → page
- Every catalog edit (severities) ends with `node build/compile.ts --lock`. If 1.3.0 was already
  released before the edit, the version is bumped MINOR first

### Parallel Opportunities

- Setup: T002–T005 in parallel, after T001
- Foundational: the tests T006–T013 in parallel; then T015, T016, T023 and T024 in parallel with
  the chain T017 → T018 and the chain T019 → T020
- Once Foundational is done, US1–US4 can be built in parallel by different people: they touch
  different `tools/`, `probes/`, `routes/`, `islands/` and `pages/` files. Edits to `codes.ts`,
  the i18n JSON files and `severities.json` must be merged carefully
- Within each story, every task marked [P] can run together

---

## Parallel Example: User Story 1

```bash
# Tests first, together:
Task: "Unit tests for headers in packages/core/tests/unit/headers.test.ts"
Task: "Contract test for POST /v1/headers in apps/api/tests/contract/headers.test.ts"
Task: "Integration test in apps/api/tests/integration/headers.test.ts"
Task: "E2E test in apps/web/tests/e2e/headers.spec.ts"

# Then, together:
Task: "headers.* codes, texts and severities"
Task: "Zod schemas in packages/contracts/src/v1/headers.ts"
```

## Parallel Example: User Story 3

```bash
Task: "Unit tests for tls in packages/core/tests/unit/tls.test.ts"
Task: "TLS connector integration test in apps/api/tests/integration/tls.test.ts"
Task: "TLS connector in the SSRF CONNECTORS list"
Task: "Contract test in apps/api/tests/contract/tls.test.ts"
Task: "E2E test in apps/web/tests/e2e/tls.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001, the architecture doc, first)
2. Phase 2: Foundational
3. Phase 3: HTTP Headers
4. **STOP and VALIDATE**: quickstart scenarios 1–5 and the privacy checks
5. Deploy: the existing API image plus the new route. There are no infrastructure changes

### Incremental Delivery

1. Setup + Foundational → base ready (catalog 1.3.0, raw headers, chain probe)
2. + HTTP Headers → first v2 release
3. + Metadata → release
4. + TLS → release (two connectors under the SSRF suite)
5. + DNS → release
6. + Security Analysis → release
7. + Polish → v2 complete

---

## Notes

- [P] = different files, no dependencies
- Every task in a story carries its [USn] label for traceability
- Verify that the tests fail before implementing
- **The person commits, not a coding agent**: agents leave the changes in the working tree and
  list the files they touched (`CLAUDE.md`)
- Never log URLs, queries, IPs, header values, cookies, documents, certificates or DNS data, even
  in debug (FR-002)
- The core never reads the clock or the network: it receives `observedAt` and observations, and
  the catalog is injected (research R2, R8)
- Business logic never goes in `apps/api/src/routes` or `apps/api/src/probes`. Probes observe;
  the core decides (Principio VIII)
- There is no Python and no `services/probes/` in v2 (research R1). Every outbound connector
  reuses `apps/api/src/inspect/ssrf.ts` and is listed in the SSRF suite (Principio V)
- Security Analysis never outputs a score, grade or verdict (FR-064)
