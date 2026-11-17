---

description: "Task list for URLkit v3, part 2 (TypeScript SDK)"
---

# Tasks: Versión 3 de URLkit, segunda parte — SDK de TypeScript para la API

**Input**: Design documents from `/specs/004-typescript-sdk/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: INCLUIDOS. El Principio VI exige pruebas primero y pruebas de contrato en ambos lados.
Escribe cada prueba, comprueba que falla y solo entonces implementa.

**Organization**: las tareas se agrupan por historia de usuario, para poder implementar y probar
cada una por separado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario a la que pertenece (US1–US4)
- Cada descripción incluye la ruta exacta del fichero

## Path Conventions

Monorepo de las features anteriores (ver [plan.md](./plan.md), "Source Code"). Rutas relativas a
la raíz. Los identificadores son de esta feature; las tareas de otras se citan como "003/T*nnn*".
Una tarea nueva lleva sufijo de letra (`T012a`) y no se renumera nada (`CLAUDE.md`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: paquete nuevo, generación de tipos y frontera que lo mantiene independiente

- [X] T001 Create `packages/sdk/package.json` for `@urlkit/sdk`, version `0.1.0`, license as the project (`FSL-1.1-ALv2`, research R7), `type: module`, `exports` → `./src/index.ts`, `publishConfig` with `access: public` and `exports`/`types` → `./dist/index.js` and `./dist/index.d.ts`, `files: ["dist", "README.md", "LICENSE"]`, scripts `generate` (`node scripts/generate.ts`), `build` (`tsc -p tsconfig.build.json`), `prepack` (`pnpm build`) and `typecheck`; no runtime `dependencies` (FR-040). Add `openapi-typescript` (exact current major) to `devDependencies`. Add `packages/sdk/tsconfig.json` (extends the base, like the other packages), `packages/sdk/tsconfig.build.json` (`noEmit: false`, `outDir: dist`, `declaration: true`, `rewriteRelativeImportExtensions: true`, only `src/`) and `packages/sdk/vitest.config.ts`. Ignore `packages/sdk/dist/` in `.gitignore` if `dist/` is not already ignored. Run `pnpm install`
- [X] T002 [P] Add the rule `sdk-is-standalone` to `.dependency-cruiser.cjs`: files under `packages/sdk/src` may import only other files under `packages/sdk/src` and Node built-ins. Add the seeded violation `tooling/boundaries/fixtures/packages/sdk/src/bad.ts` (it imports `@urlkit/core`) and its expected entry in `tooling/boundaries/boundaries.test.ts` (research R8)
- [X] T003 Write `packages/sdk/scripts/generate.ts`: it runs `openapi-typescript` on `packages/contracts/openapi.json` and writes `packages/sdk/src/generated/openapi.ts` with a header that says it is generated and must not be edited, plus `CONTRACT_VERSION` (`info.version`, FR-042) and `DEFAULT_BASE_URL` (`servers[0].url`) as exported constants. Run it and commit the output (research R1)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: la prueba de contrato al día, que protege todo lo demás

**⚠️ CRITICAL**: ninguna historia puede empezar hasta terminar esta fase

- [X] T004 Write the first half of `packages/sdk/tests/contract.test.ts`: regenerate the types in memory with the programmatic API of `openapi-typescript` and compare them with `src/generated/openapi.ts`; on difference, fail with "run `pnpm --filter @urlkit/sdk generate`" (FR-020, FR-021, research R2). Confirm it passes on the output of T003 and fails after changing a field of `packages/contracts/openapi.json` by hand (then revert)

**Checkpoint**: el paquete existe, sus tipos salen del contrato y una prueba impide que se desfasen.

---

## Phase 3: User Story 1 - Llamar a las herramientas con tipos (Priority: P1) 🎯 MVP

**Goal**: un cliente con un método tipado por herramienta, con o sin clave, contra la dirección
que se indique.

**Independent Test**: quickstart, escenarios 1–4.

### Tests for User Story 1 ⚠️

> **Escribe estas pruebas primero y comprueba que fallan**

- [X] T005 [P] [US1] Write `packages/sdk/tests/client.test.ts` with a counting fake `fetch`:
  - with `apiKey` every call sends `Authorization: Bearer <key>`; without it, no `Authorization` header (FR-002);
  - each method posts its body as JSON to `{baseUrl}{path}`, `baseUrl` defaults to `DEFAULT_BASE_URL` and a trailing slash is ignored (FR-003);
  - `lang` becomes `?lang=` only on the operations that declare it;
  - a `signal` reaches `fetch` (FR-004);
  - a `200` resolves to `{ data, rateLimit }`;
  - the client makes exactly one request per call and none at creation (FR-005, SC-004)
- [X] T006 [P] [US1] Write `apps/api/tests/sdk/sdk.test.ts`, the consumer side against the real API: the SDK with `fetch` set to the test app's `app.request` (`testApp` from `apps/api/tests/helpers.ts`) calls the ten tools without a key and with a key from `MemoryKeyStore` + `createKeyVerifier`, and each returns the shape of the contract (FR-023). Add `@urlkit/sdk` to `apps/api/package.json` `devDependencies`
- [X] T007 [P] [US1] Add to `packages/sdk/tests/client.test.ts` a type-level test (`expectTypeOf` or `// @ts-expect-error`) that a body missing a required field, or with a field of the wrong type, does not compile (scenario 4)

### Implementation for User Story 1

- [X] T008 [US1] Write `packages/sdk/src/client.ts`: `createClient(options)` returns one method per tool `operationId` (FR-001), typed from the generated `operations` (body, `200` response, `lang` where declared). The method map is declared with `satisfies Record<ToolOperationId, …>`, so a new tool operation without a method does not compile. Makes T005 and T007 pass
  - Done as: the generator also emits `TOOL_OPERATIONS` (path and `lang` per `tools` operation), and the client builds one method per entry; `UrlkitClient` is a mapped type over those ids, so a new tool gets its typed method on the next `generate`.
- [X] T009 [US1] Write `packages/sdk/src/index.ts` exporting `createClient`, the option and response types, `CONTRACT_VERSION` and the generated types (makes T006 pass)

**Checkpoint**: escenarios 1–4 del quickstart.

---

## Phase 4: User Story 2 - Errores y límites de uso tratables (Priority: P2)

**Goal**: cada error llega con su código del contrato o como error de transporte, y cada
respuesta trae sus límites.

**Independent Test**: quickstart, escenarios 5–7.

### Tests for User Story 2 ⚠️

- [X] T010 [P] [US2] Write `packages/sdk/tests/errors.test.ts` with a fake `fetch`:
  - a `ToolError` body becomes `UrlkitApiError` with `code`, `status` and `rateLimit` (FR-010);
  - `quota.exceeded` and `auth.unavailable` carry `retryAfterSeconds` from `retryAfterSeconds` or `Retry-After` (FR-011);
  - an unknown code is kept as is;
  - an error response without a contract body is `UrlkitTransportError('invalid-response')` with the `status`;
  - a rejected `fetch` is `network`, a timeout is `timeout`, an aborted signal is `aborted` (FR-013);
  - `RateLimit-*` is read on success and on error, and is `null` when any of the three headers is missing (FR-012);
  - neither the key nor the request body appears in `message`, `String(error)`, `JSON.stringify(error)` or `util.inspect(error)` of any error (FR-014, SC-005)
  - Done as: written after `errors.ts`, which the consumer test (T006) already needed, so it passed at once. To prove it bites, a client that attached the original `fetch` error as `cause` was tried: the key test failed, then the code was restored.
- [X] T011 [P] [US2] Extend `apps/api/tests/sdk/sdk.test.ts`: against the real API, an invalid key gives `UrlkitApiError` `auth.invalid` 401; the 11th anonymous `inspectRedirects` gives `quota.exceeded` with `retryAfterSeconds`; a failing `MemoryKeyStore` gives `auth.unavailable` 503; `rateLimit.limit` is 6000 with a key and 600 without on `cleanUrl`

### Implementation for User Story 2

- [X] T012 [US2] Write `packages/sdk/src/errors.ts` with `UrlkitApiError` and `UrlkitTransportError` (contracts/sdk-api.md); their message is the code or the kind, and they keep no request data
- [X] T013 [US2] Make `packages/sdk/src/client.ts` read `RateLimit-*`, turn error responses and `fetch` failures into those errors, and export them from `packages/sdk/src/index.ts` (makes T010 and T011 pass)

**Checkpoint**: escenarios 5–7 del quickstart.

---

## Phase 5: User Story 3 - El SDK no se queda atrás del contrato (Priority: P3)

**Goal**: ninguna herramienta del contrato queda sin método y ningún cambio de contrato pasa sin
regenerar.

**Independent Test**: quickstart, escenario 8.

- [X] T014 [US3] Complete `packages/sdk/tests/contract.test.ts`: read the `tools`-tagged operations of `packages/contracts/openapi.json` and require a method with each `operationId` on a created client, and no extra tool method (FR-022, SC-002)
- [X] T015 [US3] Prove both checks: add a fake `tools` operation to a copy of the contract in a test fixture and assert the coverage check names it; record in `specs/004-typescript-sdk/validation/quickstart.md` that a hand-edited contract makes T004 fail (SC-003)

**Checkpoint**: escenario 8 del quickstart.

---

## Phase 6: User Story 4 - Reintentos opcionales que respetan la API (Priority: P4)

**Goal**: reintentos solo si se piden, solo ante `429` y `503`, esperando lo que dice la API.

**Independent Test**: quickstart, escenario 9.

### Tests for User Story 4 ⚠️

- [X] T016 [P] [US4] Write `packages/sdk/tests/retry.test.ts` with a fake `fetch` and fake timers:
  - without `retries`, `429` and `503` fail at once (FR-030);
  - with `retries`, they wait `Retry-After` (1 s if missing) and retry up to `maxAttempts`, counting the first attempt (FR-031, SC-006);
  - a `Retry-After` above `maxWaitSeconds` fails at once (FR-033);
  - `401`, `400`, other `4xx` and transport errors are never retried: exactly one request (FR-032);
  - aborting the signal during a wait stops it with `UrlkitTransportError('aborted')` and no further request

### Implementation for User Story 4

- [X] T017 [US4] Write `packages/sdk/src/retry.ts` (defaults: 3 attempts and 60 s when enabled, research R5) and use it from `packages/sdk/src/client.ts` (makes T016 pass)

**Checkpoint**: escenario 9 del quickstart.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: documentación, distribución, arquitectura y validación

- [X] T018 [P] Write `packages/sdk/README.md` (FR-043): installation, a client with and without a key, one call, errors by code, rate limits, retries, `CONTRACT_VERSION`, that keys are for servers and must not be used in a browser, and that other languages can generate their client from `/v1/openapi.json`. Add `packages/sdk/LICENSE` with the project license
- [X] T019 Write `packages/sdk/tests/pack.test.ts` (SC-007): `pnpm pack` the SDK, install the tarball with `npm` in an empty temporary directory outside the repository, and run a script there that imports `@urlkit/sdk`, creates a client against a minimal HTTP server started by the test and makes one call. Use `skipUnless` (apps/api/tests/requires.ts pattern, copied into `packages/sdk/tests/`) so it fails in CI if `npm` cannot install, and skips locally without network
  - Done as: the package has no dependencies, so installing the tarball needs no network; the test only needs `npm`. The probe runs asynchronously because the HTTP server lives in the test process. It found that `README.md` had never been written (a chained command failed earlier), now fixed. The license file is `LICENSE.md`, as in the repository root. On 2026-11-17 the person chose Apache-2.0 for the SDK (research R7): `package.json` says `Apache-2.0` and the file is now `LICENSE`, the canonical apache.org text, with `pack.test.ts` updated.
- [X] T020 [P] Update `docs/arquitectura.md`: in the "Directorio / Etapa" table, `packages/sdk/` exists since v3 part 2, generated with `openapi-typescript` and checked by its tests; add a changelog row (2026-11-14). Do not touch anything else
- [X] T021 [P] Update `CLAUDE.md`, editing only the affected sentences: the v3 part 2 state, `packages/sdk/` exists (generated types, `pnpm --filter @urlkit/sdk generate` after a contract change), its consumer test lives in `apps/api/tests/sdk/`, and it is not published
- [X] T022 Run `pnpm lint`, `pnpm typecheck`, `pnpm boundaries`, `pnpm test` (with the 003 services), `pnpm test:e2e`, `pnpm build`, `pnpm size` and `pnpm lhci`, and fix any failure. Confirm `size` and `lhci` do not change. Record the run in `specs/004-typescript-sdk/validation/quality-gates.md`
- [X] T023 Run the [quickstart.md](./quickstart.md) scenarios 1–10 against a local API and record them in `specs/004-typescript-sdk/validation/quickstart.md`. Time scenario 1 from reading the README to the first correct call (SC-001: under 5 minutes)
  - Done as: scenarios 1–10 pass (4, 8 and 10 by automated tests). SC-001 needs a person who does not know the SDK and is left for the pending usability session; the README example was checked to work as written. Protocol and rehearsal (2026-11-15) in `specs/004-typescript-sdk/validation/usability.md`: it needs a developer, not the non-technical participants of 001/T103 and 002/T098b.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 first; T002 in parallel with T003
- **Foundational (Phase 2)**: T004 depends on T003 and blocks every story
- **US1 (Phase 3)**: depends on Foundational
- **US2 (Phase 4)**: depends on US1 (it extends the client)
- **US3 (Phase 5)**: depends on US1 (it needs the methods)
- **US4 (Phase 6)**: depends on US2 (it retries on the typed errors)
- **Polish (Phase 7)**: T019 after US1; T022–T023 last

### Within Each User Story

- Tests first and failing → errors and types → client → exports
- `src/generated/openapi.ts` is never edited by hand: only `pnpm --filter @urlkit/sdk generate`

### Parallel Opportunities

- Setup: T002 and T003 after T001
- US1: T005, T006 and T007 together
- US2: T010 and T011 together
- US3 can run in parallel with US2 (different files)
- Polish: T018, T020 and T021 together

## Parallel Example: User Story 1

```bash
T005 packages/sdk/tests/client.test.ts
T006 apps/api/tests/sdk/sdk.test.ts
T007 packages/sdk/tests/client.test.ts (type-level cases)
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Fases 1 y 2.
2. Fase 3 (US1).
3. **Parar y validar**: escenarios 1–4 del quickstart. El SDK ya sirve para llamar a todas las
   herramientas; los errores llegan aún sin tipar.

### Incremental Delivery

1. Base → US1 (llamadas) → US2 (errores y límites) → US3 (contrato al día) → US4 (reintentos).
2. Cierre: README, empaquetado y documentación. El paquete queda listo para publicar, sin
   publicarse (FR-041).

### Notes

- Nada en `packages/sdk/src` importa otro paquete del monorepo (regla `sdk-is-standalone`).
- La API, su contrato y la web no cambian; si una tarea parece necesitarlo, está mal planteada.
