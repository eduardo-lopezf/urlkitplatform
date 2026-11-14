# Implementation Plan: Versión 3 de URLkit, primera parte — claves de API y cuotas por plan

**Branch**: `003-api-keys` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-api-keys/spec.md`

## Summary

Una organización puede usar la API `/v1` con una clave en `Authorization: Bearer` y recibir los
límites de su plan. El operador crea organizaciones y claves con una CLI que se ejecuta dentro del
contenedor de la API. Sin clave, nada cambia.

Es la primera persistencia del producto. Las organizaciones, las claves (solo su resumen SHA-256)
y los recuentos diarios de consumo se guardan en **PostgreSQL**, propiedad de la API Node, con
`pg` y Kysely ([research R1](./research.md)). La arquitectura nombraba SQLAlchemy y Alembic
(Python); la persona decidió mantener PostgreSQL desde Node, y `docs/arquitectura.md` se enmienda
en la primera tarea.

La API verifica la clave con una caché de 30 s (revocación efectiva en menos de un minuto, R3),
identifica la petición con el sujeto `organization` que ya existe desde el MVP (R5), y el
limitador, las cabeceras `RateLimit-*` y `quota.exceeded` no cambian. Los planes son un fichero
versionado junto al código (R4). El contrato solo crece: 401 `auth.invalid`, 503 `auth.unavailable`
(código nuevo) y las mismas cabeceras (R8). El núcleo no se toca.

## Technical Context

**Language/Version**: TypeScript en modo estricto; Node.js ≥ 24 (probado en 26.5.0). Sin Python
(research R1)

**Primary Dependencies**: las de la v2. Nuevas, en `apps/api`, justificadas en research:

- `pg` (controlador de PostgreSQL) y `@types/pg` (R1);
- `kysely` (consultas tipadas y migrador con `up`/`down`) (R1).

La CLI usa `node:util.parseArgs`; el formato de la clave, `node:crypto` (R2, R7).

**Storage**: PostgreSQL 17 (imagen oficial `postgres:17-alpine`) con tres tablas
([data-model.md](./data-model.md)). Valkey sigue solo para los contadores de cuota, con claves de
sujeto `organization:<id>` además de `anon-ip:<hash>`

**Testing**: Vitest. `KeyStore` en memoria para rutas y limitador; integración contra PostgreSQL
real con `DATABASE_URL` (se salta sin ella; en CI hay servicio PostgreSQL, como el de Valkey);
contrato (401, 503, cabeceras con clave y respuestas anónimas sin cambios); privacidad; copia y
restauración (R11)

**Target Platform**: la misma. Contenedor OCI de la API detrás de Caddy y `egress-guard`, ahora con
un servicio `postgres` al que solo se llega desde el propio servidor (R12)

**Project Type**: aplicación web (monorepo existente). La feature vive casi entera en `apps/api`

**Performance Goals**: el tiempo hasta la respuesta con clave no supera en más de 50 ms al anónimo
en el 95 % de los casos (SC-004); la caché evita la base de datos en casi todas las peticiones

**Constraints**:

- Nunca guardar URLs, consultas, contenido ni IPs; la clave solo como resumen (FR-040, FR-003).
- La clave nunca en logs, trazas, métricas ni errores (FR-042).
- Revocación efectiva en menos de 60 s en todas las instancias (FR-013).
- Sin clave, el comportamiento es idéntico al actual (FR-011).
- El núcleo no conoce organizaciones, planes ni claves (FR-045).

**Scale/Scope**:

- 3 tablas, 1 CLI con 11 órdenes, 1 código de contrato nuevo y ninguna página web.
- Decenas de organizaciones al principio; el consumo está acotado por los planes (como mucho miles
  de filas al día en `usage_daily`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cómo lo cumple el plan | Estado |
|---|---|---|
| I. Herramientas modulares | Ninguna herramienta cambia; la autenticación es transversal y vive en el adaptador | ✅ |
| II. Corrección según estándares | `Authorization: Bearer` según RFC 6750, con `WWW-Authenticate` en el 401. Errores con códigos estables | ✅ |
| III. Minimalismo funcional | Sin interfaz nueva: la web no cambia | ✅ |
| IV. API-first y SaaS | Lo que la constitución preparó se activa sin romper nada: esquema `apiKey` ya declarado, sujeto `organization` ya modelado, mismas cabeceras de límite, sin versión nueva. Planes en una capa separada del núcleo. Los servicios siguen sin estado: la caché de 30 s es solo una optimización por proceso (R3, R5) | ✅ |
| V. Privacidad y seguridad | Solo se guardan organizaciones sin datos personales, resúmenes de claves y recuentos (FR-040). Secreto de 256 bits con comparación en tiempo constante (R2). Claves fuera de logs y trazas. PostgreSQL solo accesible desde el propio servidor. `docs/privacidad.md` se actualiza antes de emitir claves a terceros (FR-046) | ✅ |
| VI. Calidad con pruebas | Pruebas primero; integración contra PostgreSQL real en CI; contrato que demuestra que lo anónimo no cambia; prueba de restauración (R11) | ✅ |
| VII. Simplicidad | Una pieza de infraestructura nueva, PostgreSQL, que la arquitectura ya preveía para la v3 y que la spec necesita (primera persistencia). Sin servicio ni lenguaje nuevos, sin colas: el consumo se escribe después de responder y la conservación la hace un temporizador del proceso (R6). Dos dependencias pequeñas | ✅ |
| VIII. Adaptadores delgados | La identificación es el paso "identificar" que ya existe en cada ruta (`identify()` en `routes/v1/shared.ts`); la verificación vive en `apps/api/src/auth/`. El núcleo no cambia | ✅ |
| IX. Fronteras explícitas | Un solo dueño del esquema, la API; la CLI es parte del mismo servicio. Migraciones versionadas con `down`. Modos de fallo declarados: 503 `auth.unavailable` si la base de datos no responde (R8) | ✅ |
| X. Datos declarativos versionados | Planes en `plans.json` con esquema, revisados como código (R4). Código nuevo `auth.unavailable` con textos es/en | ✅ |
| Restricciones (rendimiento, i18n) | SC-004 con la caché; sin cambios en las páginas ni en su presupuesto de JS | ✅ |

**Desviación de `docs/arquitectura.md`** (no de la constitución): la tabla de la versión 3 nombra
SQLAlchemy 2 y Alembic, y §12 "migraciones Alembic". El plan usa `pg` y Kysely desde Node por las
razones de research R1. `CLAUDE.md` pide preguntar antes de desviarse de ese documento: la persona
eligió esta opción el 2026-11-13. El documento se enmienda en la primera tarea de la fase de base,
antes que el código, como se hizo con §11 en la v2.

**Resultado de la puerta (antes de la fase 0)**: PASA, con la desviación de la arquitectura
decidida y documentada.

**Revisión tras la fase 1**: PASA.

- El modelo de datos solo guarda lo que permite FR-040, y las tablas no tienen ninguna columna
  para URLs, IPs ni secretos.
- El contrato solo añade cosas: un código, dos estados de respuesta en los endpoints de
  herramientas y valores de cabecera. Las respuestas anónimas no cambian.
- La CLI no abre ninguna superficie pública.

## Project Structure

### Documentation (this feature)

```text
specs/003-api-keys/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas (R1–R12)
├── data-model.md        # Fase 1: tablas, planes, estados e identidad de una petición
├── quickstart.md        # Fase 1: guía de validación
├── contracts/
│   ├── api-auth.md      # Cambios en /v1: Bearer, 401, 503 y cabeceras con clave
│   └── admin-cli.md     # Órdenes, salidas y códigos de salida de la CLI
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks; no lo crea este comando)
```

### Source Code (repository root)

Solo los directorios nuevos (`+`) o modificados (`~`); el resto es el árbol de las features
[001](../001-mvp-url-toolkit/plan.md) y [002](../002-v2-network-analysis/plan.md).

```text
apps/api/
├── src/
│   ├── auth/                        + verificación de claves
│   │   ├── key-format.ts            + generar, analizar y resumir claves uk_<id>_<secreto> (R2)
│   │   ├── key-store.ts             + interfaz KeyStore y versión en memoria para pruebas
│   │   └── verify.ts                + caché de 30 s, comparación en tiempo constante, fallos (R3, R8)
│   ├── db/                          + persistencia (dueña del esquema)
│   │   ├── client.ts                + pool de pg y Kysely desde DATABASE_URL
│   │   ├── schema.ts                + interfaz Database de Kysely
│   │   ├── migrations/0001-init.ts  + organizations, api_keys, usage_daily (up y down)
│   │   └── migrate.ts               + aplica las migraciones pendientes al arrancar
│   ├── usage/                       + consumo
│   │   ├── record.ts                + suma uno después de responder (R6)
│   │   └── prune.ts                 + borra lo de más de 13 meses (arranque y cada día)
│   ├── admin/cli.ts                 + CLI del operador (contracts/admin-cli.md)
│   ├── quota/
│   │   ├── plans.json               + planes anonymous y organization (R4)
│   │   ├── plans.ts                 ~ planFor() lee plans.json; plan desconocido → anonymous
│   │   └── subject.ts               ~ resolveSubject() con la clave verificada
│   ├── routes/v1/shared.ts          ~ identify() asíncrono: anónimo, organización, 401 o 503
│   ├── app.ts                       ~ AppDeps con keyVerifier y usageRecorder
│   └── server.ts                    ~ DATABASE_URL, migraciones, temporizador de conservación
├── tests/
│   ├── unit/                        + formato de clave, caché, planes
│   ├── integration/                 + PostgreSQL real: migraciones, claves, consumo, conservación, copia
│   │                                ~ privacy.test.ts y observability.test.ts: ni claves ni secretos
│   └── contract/                    ~ 401, 503 y cabeceras con clave; anónimo sin cambios
└── package.json                     ~ pg, kysely, @types/pg; script admin

packages/
├── contracts/src/errors.ts          ~ auth.unavailable; auth.invalid deja de estar reservado
├── contracts/src/openapi.ts         ~ respuestas 401 y 503 en los endpoints de herramientas
└── i18n/src/{es,en}.json            ~ textos de auth.invalid y auth.unavailable

docker-compose.yml                   ~ servicio postgres en la red interna, con volumen (R12)
.env.example                         ~ DATABASE_URL y POSTGRES_PASSWORD
.github/workflows/ci.yml             ~ servicio PostgreSQL y DATABASE_URL en el trabajo quality
infrastructure/
├── README.md                        ~ uso de la CLI, copias con pg_dump y restauración
└── check-selfhosted.sh              ~ postgres en marcha y con el puerto solo en loopback

docs/
├── arquitectura.md                  ~ tabla v3 y §12: PostgreSQL desde Node con pg y Kysely
└── privacidad.md                    ~ qué se guarda de las organizaciones, plazos y quién lo ve

CLAUDE.md                            ~ estado de la v3; la base de datos ya existe
```

**Structure Decision**: todo queda en `apps/api`, que pasa a ser dueño del esquema; no hay paquete
ni servicio nuevos. `packages/core` no cambia, y `pnpm boundaries` sigue comprobando que no importa
nada de la API. La CLI vive en la API porque comparte su módulo de base de datos y es la única otra
pieza que toca esas tablas (Principio IX).

## Delivery Order

Incrementos utilizables, en el orden de la spec (Principio VII):

1. **Base**:
   - enmendar `docs/arquitectura.md` (R1);
   - PostgreSQL en Compose y en CI;
   - módulo `db` con la migración inicial;
   - `auth.unavailable` en el contrato.
2. **P1, usar la API con una clave**:
   - formato de clave, `KeyStore` y verificación con caché;
   - `identify()` con 401 y 503;
   - CLI con `org create`, `org list`, `key create` y `key list`.
3. **P2, límites según el plan**:
   - `plans.json` y `planFor()`;
   - sujeto `organization` en la cuota;
   - CLI con `plans list` y `org set-plan`.
4. **P3, revocar y ver el consumo**:
   - `key revoke`, `org deactivate` y `org activate`;
   - medición del consumo y conservación de 13 meses;
   - `usage show` y `usage prune`.
5. **Cierre**:
   - `docs/privacidad.md`, guía de copias y `check-selfhosted.sh`;
   - quickstart y puertas de calidad;
   - `CLAUDE.md`.

## Complexity Tracking

Sin infracciones de la constitución que justificar. La única pieza de infraestructura nueva,
PostgreSQL, la exige la spec (primera persistencia) y la arquitectura ya la preveía para la v3. La
desviación de las herramientas de acceso (Kysely en lugar de SQLAlchemy) está justificada en
research R1 y decidida por la persona.
