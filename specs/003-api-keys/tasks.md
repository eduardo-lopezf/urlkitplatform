---

description: "Task list for URLkit v3, part 1 (API keys and quotas by plan)"
---

# Tasks: Versión 3 de URLkit, primera parte — claves de API y cuotas por plan

**Input**: Design documents from `/specs/003-api-keys/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: INCLUIDOS. El Principio VI exige pruebas primero, pruebas de contrato en ambos lados de
la API e integración contra los servicios reales. Escribe cada prueba, comprueba que falla y solo
entonces implementa.

**Organization**: las tareas se agrupan por historia de usuario, para poder implementar y probar
cada una por separado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario a la que pertenece (US1–US3)
- Cada descripción incluye la ruta exacta del fichero

## Path Conventions

Es el monorepo de las features 001 y 002 (ver [plan.md](./plan.md), "Source Code"). Las rutas son
relativas a la raíz del repositorio. Los identificadores de tarea son de esta feature: `T001` aquí
no es el de la 001 ni el de la 002; cuando se cita otra se escribe "001/T*nnn*" o "002/T*nnn*".

Los identificadores son definitivos. Si más adelante hace falta una tarea nueva, lleva sufijo de
letra (`T012a`) y no se renumera nada (`CLAUDE.md`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: decisión de arquitectura documentada, dependencias y PostgreSQL en local y en CI

- [X] T001 Update `docs/arquitectura.md`, **before any code**. In the "Versión 3 — plataforma" table, replace "ORM: SQLAlchemy 2" and "Migraciones: Alembic" with `kysely` on `pg`, owned by the Node API, and say why in one sentence (research R1). In §12, change the "Servicio ↔ PostgreSQL (v3)" row to "Migraciones Kysely (`up`/`down`)". Add a changelog row (2026-11-13). Do not touch anything else
- [X] T002 In `specs/003-api-keys/spec.md`, change FR-022 and US2 scenario 4 from "desde la siguiente petición" to "en menos de un minuto", like FR-013: the verification cache of research R3 also caches the organization's plan. Add the reason to Clarifications. **Needs the person's approval before editing the spec** (`CLAUDE.md`)
  - Done as: approved by the person on 2026-11-13. FR-022, US2 scenario 4, a Clarifications entry and quickstart scenario 7 updated.
- [X] T003 [P] Add `pg` and `kysely` (exact current majors) to `apps/api/package.json` dependencies and `@types/pg` to devDependencies; add the script `"admin": "node src/admin/cli.ts"`. Run `pnpm install` (research R1, R7)
- [X] T004 [P] Add a `postgres` service to `docker-compose.yml`: image `postgres:17-alpine`, `logging: *logging`, network `internal` only, port `127.0.0.1:5432:5432` for development, named volume `postgres_data`, healthcheck with `pg_isready`, `POSTGRES_PASSWORD` from `.env` (default `urlkit` only outside production). Add it to the default services and the `full` and `selfhosted` profiles; `api` gets `DATABASE_URL` and `depends_on: postgres: { condition: service_healthy }` (research R12)
- [X] T005 [P] Add `DATABASE_URL` and `POSTGRES_PASSWORD` to `.env.example`, with comments: generate the password with `openssl rand -hex 24`; `.env` is never committed
- [X] T006 [P] Add a PostgreSQL service (`postgres:17-alpine`) to the `quality` job of `.github/workflows/ci.yml`, next to Valkey, and set `DATABASE_URL` for `pnpm test`, so the integration tests run in CI instead of being skipped

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: módulo de base de datos con la migración inicial, contrato ampliado e interfaz de
almacén de claves

**⚠️ CRITICAL**: ninguna historia puede empezar hasta terminar esta fase

- [X] T007 Write `apps/api/tests/integration/db.test.ts` (skipped without `DATABASE_URL`, like `valkey.test.ts`). On a fresh schema: migrating up creates `organizations`, `api_keys` and `usage_daily` with exactly the columns, types, keys and constraints of [data-model.md](./data-model.md); no column can hold a URL, an IP, a secret or personal contact data (FR-040, FR-041); migrating down leaves the schema empty; the columns match the Kysely `Database` interface. Confirm it fails
- [X] T008 Write `apps/api/src/db/client.ts` (a `pg` pool and a `Kysely<Database>` built from `DATABASE_URL`, closed on shutdown) and `apps/api/src/db/schema.ts` (the `Database` interface) (research R1)
- [X] T009 Write `apps/api/src/db/migrations/0001-init.ts` with `up` and `down` for the three tables of data-model.md, including: `organizations.name` unique case-insensitively; `status` limited to `active`/`inactive`; `api_keys.secret_hash` exactly 32 bytes; `usage_daily` primary key `(day, key_id, bucket)` and `count >= 1`. Write `apps/api/src/db/migrate.ts`, which applies pending migrations with Kysely's `Migrator` (makes T007 pass)
- [X] T010 Update `apps/api/src/server.ts`. With `DATABASE_URL`, build the database client and run `migrate.ts` before listening. Without it, outside production, log `keys.disabled` and start with keys disabled (research R10). In production, refuse to start without `DATABASE_URL`, like `REDIS_URL` today
- [X] T011 [P] Add `auth.unavailable` to `CONTRACT_CODES` in `packages/contracts/src/errors.ts`, and update the comments: `auth.invalid` is no longer reserved, `auth.missing` still is. In `packages/contracts/src/openapi.ts`, declare `401` (`auth.invalid`, with `WWW-Authenticate`) and `503` (`auth.unavailable`, with `Retry-After`) on every tool endpoint ([contracts/api-auth.md](./contracts/api-auth.md))
- [X] T012 [P] Add the es/en texts of `auth.invalid` and `auth.unavailable` to `packages/i18n/src/es.json` and `packages/i18n/src/en.json`; the parity test must pass
  - Done as: not needed. No contract code (`quota.exceeded`, `request.*`, `internal.error`) has texts in `packages/i18n`, and `?lang` only localizes tool messages, never error responses (`apps/api/src/presentation/localize.ts`); the texts would be unused keys. `contracts/api-auth.md` updated.
- [X] T013 [P] Write `apps/api/tests/contract/anonymous-unchanged.test.ts`: for every tool endpoint, a request without `Authorization` gets the same status, body shape and `RateLimit-*` values as before this feature (FR-011, SC-002). Run it now, while nothing has changed yet, and keep it green through every later phase
- [X] T014 Write `apps/api/src/auth/key-store.ts`: the `KeyStore` interface (find a key by id with its organization's status and plan; create, list and revoke keys; create, list, update and change the status of organizations) and `MemoryKeyStore` for tests, like `MemoryStore` in the quotas

**Checkpoint**: la base de datos migra arriba y abajo, el contrato declara los errores nuevos y
el uso anónimo tiene su prueba de no regresión.

---

## Phase 3: User Story 1 - Usar la API con una clave emitida por el operador (Priority: P1) 🎯 MVP

**Goal**: el operador crea una organización y una clave, y la API atiende las peticiones con esa
clave atribuyéndolas a la organización. Sin clave, todo sigue igual.

**Independent Test**: quickstart, escenarios 1–4.

### Tests for User Story 1 ⚠️

> **Escribe estas pruebas primero y comprueba que fallan**

- [X] T015 [P] [US1] Write `apps/api/tests/unit/key-format.test.ts`:
  - a generated key matches `uk_` + 12 lower-case base32 characters + `_` + 43 base64url characters;
  - two generated keys never collide;
  - parsing returns the id and the secret, and rejects any other shape (empty, other prefix, wrong lengths, extra parts);
  - the stored hash is the SHA-256 of the secret and never contains the secret (research R2)
- [X] T016 [P] [US1] Write `apps/api/tests/unit/verify.test.ts` against `MemoryKeyStore` and an injected clock:
  - a valid key resolves to its organization and plan;
  - unknown id, wrong secret, revoked key and inactive organization all give the same `invalid` result;
  - the secret is compared with `timingSafeEqual`;
  - results, valid and invalid, are cached for 30 s and re-read after;
  - the cache never holds more than 10,000 entries;
  - a store failure gives `unavailable`, unless the key is still in the cache (research R3, R8)
- [X] T017 [P] [US1] Write `apps/api/tests/integration/key-store.test.ts` (skipped without `DATABASE_URL`): the PostgreSQL `KeyStore` passes the same behaviour cases as `MemoryKeyStore`, and `api_keys` only ever holds the 32-byte hash
- [X] T018 [P] [US1] Write `apps/api/tests/contract/auth.test.ts` with `MemoryKeyStore`. With a valid key in `Authorization: Bearer`, every tool endpoint answers as without it (FR-010). A missing header is anonymous. An empty header, `Basic …`, a malformed key, an unknown key, a revoked key and a key of an inactive organization all get `401`, the same `auth.invalid` body and `WWW-Authenticate: Bearer`. Each `401` consumes one anonymous use of that tool's bucket, and once that quota is exhausted the answer is `429 quota.exceeded` (FR-012, FR-027). An unavailable store gives `503 auth.unavailable` with `Retry-After: 30`, while requests without a header still get `200` (FR-043)
- [X] T019 [P] [US1] Write `apps/api/tests/integration/admin-cli.test.ts` (skipped without `DATABASE_URL`). `org create --name --plan` creates an active organization and rejects a repeated name or an unknown plan with exit code 1, changing nothing. `org list` lists it. `key create <org>` prints the full key once, and that key verifies. `key list <org>` shows the id and dates and never the secret. `--json` gives the shapes of [contracts/admin-cli.md](./contracts/admin-cli.md) (FR-001–FR-004)
- [X] T020 [P] [US1] Extend `apps/api/tests/integration/privacy.test.ts` and `apps/api/tests/integration/observability.test.ts`: across valid, invalid and unavailable-store requests, logs, traces and the error scrubber never contain a full key or its secret; at most the key id (FR-042, SC-005)

### Implementation for User Story 1

- [X] T021 [P] [US1] Write `apps/api/src/auth/key-format.ts`: `generateKey()`, `parseKey()` and `hashSecret()` with `node:crypto` (makes T015 pass)
- [X] T022 [US1] Write `apps/api/src/auth/verify.ts`: `createKeyVerifier({ store, now })` with the 30 s cache and the `valid` / `invalid` / `unavailable` outcomes (makes T016 pass)
- [X] T023 [US1] Write `apps/api/src/db/key-store.ts`, the PostgreSQL `KeyStore` on Kysely (makes T017 pass)
- [X] T024 [US1] Make `identify()` in `apps/api/src/routes/v1/shared.ts` asynchronous. It reads `Authorization`. With no header it returns the anonymous subject as today. With a header it verifies it and returns `{ type: 'organization', organizationId }` plus the key id, or answers `401` (after consuming anonymous quota) or `503`, as in [contracts/api-auth.md](./contracts/api-auth.md). Update the twelve call sites in `apps/api/src/routes/v1/*.ts` to `await` it; `metrics.ts` ignores the header. No product rule moves into the routes (Principio VIII). Makes T018 pass
  - Done as: eleven call sites (`metrics.ts` uses `identifyAnonymous()`, which ignores the header). Each tool route also declares `401` and `503` through `AUTH_RESPONSES`, because `@hono/zod-openapi` only accepts declared responses.
- [X] T025 [US1] Add `keyVerifier` to `AppDeps` in `apps/api/src/app.ts` and build it in `apps/api/src/server.ts` from the PostgreSQL store, or a verifier that answers `invalid` to every key when keys are disabled (research R10)
- [X] T026 [US1] Write `apps/api/src/admin/cli.ts` with `node:util.parseArgs`: `org create`, `org list`, `key create` and `key list`, text or `--json` output, exit codes 0/1/2, one transaction per change (makes T019 pass)
  - Done as: `runCli(argv, deps)` is the testable entry point; `node src/admin/cli.ts` calls it. `plans.json` (T031) was written first, because `org create --plan` validates the plan id.
- [X] T027 [US1] Make sure no log line, trace attribute or error report includes the `Authorization` header or the parsed key, in `apps/api/src/privacy/logger.ts` and `apps/api/src/observability/errors.ts` if needed (makes T020 pass)

**Checkpoint**: escenarios 1–4 del quickstart; las pruebas de contrato anónimas siguen en verde.

---

## Phase 4: User Story 2 - Límites de uso según el plan de la organización (Priority: P2)

**Goal**: cada organización recibe los límites de su plan, compartidos entre todas sus claves, con
las mismas cabeceras y el mismo error de cuota de hoy.

**Independent Test**: quickstart, escenarios 5–7.

### Tests for User Story 2 ⚠️

- [X] T028 [P] [US2] Write `apps/api/tests/unit/plans.test.ts`:
  - `plans.json` validates against its schema (FR-020, FR-021);
  - `anonymous` has exactly the current limits;
  - `organization` has the limits of research R4;
  - a bucket missing from a plan falls back to `anonymous`, and no plan is unlimited;
  - `planFor()` gives the organization's plan for an `organization` subject, and `anonymous` for an unknown plan id, with a `plan.unknown` warning (FR-025)
- [X] T029 [P] [US2] Extend `apps/api/tests/contract/auth.test.ts`:
  - with a key, `RateLimit-*` shows the organization plan's limits;
  - two keys of one organization, both active at once, add up against the same counters (FR-005);
  - when the organization exhausts a bucket it gets `429` with `Retry-After`, with either key, while other buckets still answer;
  - exhausting the organization's quota does not affect anonymous requests, and the reverse (FR-023, FR-024, FR-026)
- [X] T030 [P] [US2] Extend `apps/api/tests/integration/admin-cli.test.ts`: `plans list` lists the plans of `plans.json`; `org set-plan` changes the plan, rejects an unknown one with exit code 1, and the new limits apply within the cache lifetime (FR-022)

### Implementation for User Story 2

- [X] T031 [P] [US2] Write `apps/api/src/quota/plans.json` (`anonymous` and `organization`, research R4) and its JSON schema `apps/api/src/quota/plans.schema.json`
- [X] T032 [US2] Rewrite `apps/api/src/quota/plans.ts`: load `plans.json`, apply the fallback to `anonymous`, and make `planFor(subject, planId?)` return the organization's plan. Keep `ANONYMOUS_PLAN` exported for existing imports (makes T028 pass)
- [X] T033 [US2] Pass the verified plan id to the limiter for `organization` subjects in `apps/api/src/quota/limiter.ts` and `apps/api/src/routes/v1/shared.ts`. Make `quotaExceeded()` log the real `subjectType` instead of the fixed `'anon-ip'` (makes T029 pass)
- [X] T034 [US2] Add `plans list` and `org set-plan` to `apps/api/src/admin/cli.ts` (makes T030 pass)

**Checkpoint**: escenarios 5–7 del quickstart.

---

## Phase 5: User Story 3 - Revocar claves y conocer el consumo (Priority: P3)

**Goal**: el operador revoca claves y desactiva organizaciones con efecto en menos de un minuto, y
consulta el consumo por día, clave y herramienta, que se conserva 13 meses.

**Independent Test**: quickstart, escenarios 8–10.

### Tests for User Story 3 ⚠️

- [X] T035 [P] [US3] Extend `apps/api/tests/integration/admin-cli.test.ts`. `key revoke` makes the key invalid, is idempotent and cannot be undone. `org deactivate` invalidates all its keys, and `org activate` restores them. `org list --all` shows inactive organizations. With an injected clock, a revoked key is rejected by a verifier whose cache entry is older than 30 s, so the change is effective in under a minute (FR-006, FR-013, SC-003)
- [X] T036 [P] [US3] Write `apps/api/tests/integration/usage.test.ts` (skipped without `DATABASE_URL`):
  - each served request with a key adds one to `(day, key_id, bucket)`;
  - requests rejected by quota or with `401` add nothing;
  - a failing write never fails the request and logs no request data;
  - the counts equal the served requests in a run with known numbers (FR-030, SC-006);
  - `prune` deletes rows older than 13 months and keeps the rest (FR-033)
- [X] T037 [P] [US3] Extend `apps/api/tests/integration/admin-cli.test.ts`: `usage show <org>` prints the counts per day, key and bucket with a total, filtered by `--from`/`--to`, with no URL or IP (FR-031, FR-032); `usage prune` reports the deleted rows

### Implementation for User Story 3

- [X] T038 [US3] Add `key revoke`, `org deactivate`, `org activate` and `org list --all` to `apps/api/src/admin/cli.ts` and the PostgreSQL store (makes T035 pass)
- [X] T039 [US3] Write `apps/api/src/usage/record.ts`: an upsert run after the response is sent, whose errors are caught and logged as `usage.write-failed` with no request data. Add `usageRecorder` to `AppDeps` and call it from `apps/api/src/routes/v1/shared.ts` for served requests with a key (research R6)
  - Done as: `applyQuota()` now takes the whole identity and records the use when the quota allows it and there is a key; the write is not awaited, so it never delays the response. A request whose use is refunded (DNS `503`) is still counted.
- [X] T040 [US3] Write `apps/api/src/usage/prune.ts` and run it from `apps/api/src/server.ts` at start-up and then daily with an `unref`'d timer (makes T036 pass)
- [X] T041 [US3] Add `usage show` and `usage prune` to `apps/api/src/admin/cli.ts` (makes T037 pass)

**Checkpoint**: escenarios 8–10 del quickstart.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: privacidad, copias de seguridad, despliegue, medición y validación

- [X] T042 [P] Extend `apps/web/tests/e2e/privacy.spec.ts`: no request from any page sends an `Authorization` header (FR-014)
- [X] T043 [P] Update `docs/privacidad.md`, **before any key is issued to a third party** (FR-046). Say what is stored about organizations that use keys (name, internal note, plan, key hashes and daily counts, never personal data), for how long (counts 13 months; organizations and keys while they exist) and who can see it (only the operator, through the CLI on the server). Add the row to "Qué cambiará" or the provider table as fits, and update the header date
- [X] T044 [P] Update `infrastructure/README.md`:
  - a "Claves de API" section with the CLI commands of [contracts/admin-cli.md](./contracts/admin-cli.md), run with `docker compose exec api …`;
  - a "Copias de seguridad" section: `pg_dump --format=custom` and `pg_restore` into an empty database, how often, and that the only things to keep are `.env` and the dump
- [X] T045 Write `apps/api/tests/integration/backup.test.ts` (skipped without `DATABASE_URL`, or without `pg_dump` and `pg_restore`): dump a database with active and revoked keys, restore it into an empty one, and check that active keys verify and revoked ones do not (FR-044, SC-007)
- [X] T046 [P] Update `infrastructure/check-selfhosted.sh`: `postgres` among the running services, and a check that its port is published on `127.0.0.1` only
  - Changed while implementing: the task first said "cannot reach a public address". Like Valkey, `postgres` is also on the `default` network so development can reach it on localhost (an internal network cannot publish ports); what matters is that nothing outside the server can connect. research R12 corrected.
- [X] T047 [P] Add a `--key <file>` option to the `--timing` mode of `apps/api/scripts/reference-check.ts`: it reads the key from a file (never from the command line), runs each request with and without it, and reports the p95 difference (SC-004). Record a local run in `specs/003-api-keys/validation/quality-gates.md`
  - Done as: a separate `--auth-overhead <api> --key <file>` mode measured on `/v1/clean`, because network tools' variance would hide a 50 ms difference. p95 difference 0.2 ms.
- [X] T048 Update `CLAUDE.md`, editing only the affected sentences: the v3 part 1 state, that the database now exists (PostgreSQL owned by `apps/api`, with `pg` and Kysely), how integration tests get `DATABASE_URL`, and that the admin CLI runs inside the API container
- [X] T049 Run `pnpm lint`, `pnpm typecheck`, `pnpm boundaries`, `pnpm test` (with `DATABASE_URL` and `REDIS_URL`), `pnpm test:e2e`, `pnpm build`, `pnpm size` and `pnpm lhci`, and fix any failure. Confirm `packages/core` has no new import. Record the run in `specs/003-api-keys/validation/quality-gates.md`
- [X] T050 Run the [quickstart.md](./quickstart.md) scenarios 1–13 and its privacy checks against `pnpm dev` with PostgreSQL. Time scenario 1 from start to the printed key (SC-001: under 2 minutes). Record the results in `specs/003-api-keys/validation/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. T001 goes first: the architecture amendment is written
  before any code. T002 is done
- **Foundational (Phase 2)**: depends on Setup (T003–T006) and BLOCKS all user stories
- **US1 (Phase 3)**: depends on Foundational
- **US2 (Phase 4)**: depends on US1 (it needs keys and the organization subject)
- **US3 (Phase 5)**: depends on US1; independent of US2
- **Polish (Phase 6)**: depends on the stories it covers. T049–T050 come last

### Within Each User Story

- Tests first and failing → format and verification → store → routes → CLI
- The anonymous no-regression test (T013) stays green at every checkpoint

### Parallel Opportunities

- Setup: T003–T006 in parallel, after T001
- Foundational: T011, T012 and T013 in parallel with the chain T007 → T008 → T009 → T010; T014
  in parallel with the chain
- US1: the tests T015–T020 in parallel; then T021, which is independent, in parallel with T023
- US2 and US3 can be built in parallel after US1: they touch different CLI commands (merge
  `cli.ts` carefully) and different modules (`quota/` and `usage/`)

## Parallel Example: User Story 1

```bash
# Todas las pruebas de la US1 a la vez (fallan hasta implementar):
T015 apps/api/tests/unit/key-format.test.ts
T016 apps/api/tests/unit/verify.test.ts
T017 apps/api/tests/integration/key-store.test.ts
T018 apps/api/tests/contract/auth.test.ts
T019 apps/api/tests/integration/admin-cli.test.ts
T020 privacy.test.ts y observability.test.ts

# Después, en paralelo:
T021 apps/api/src/auth/key-format.ts
T023 apps/api/src/db/key-store.ts
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Fases 1 y 2.
2. Fase 3 (US1).
3. **Parar y validar**: escenarios 1–4 del quickstart. Las claves ya funcionan con los límites
   anónimos, que es lo que da `planFor()` hasta la US2.

### Incremental Delivery

1. Base → US1 → validar (claves aceptadas y atribuidas).
2. US2 → validar (límites del plan).
3. US3 → validar (revocación y consumo). Solo entonces se emiten claves a terceros, después de
   T043 (privacidad).

### Notes

- Ninguna tarea toca `packages/core` (FR-045); si una parece necesitarlo, está mal ubicada.
- La clave nunca se pasa por la línea de órdenes de ningún script ni aparece en salidas salvo en
  `key create`.
- El despliegue de esta parte va con el resto de la plataforma (001/T111–T114).
