# Quickstart: validar las claves de API

Guía para comprobar de principio a fin que la feature funciona. Los detalles están en
[contracts/api-auth.md](./contracts/api-auth.md), [contracts/admin-cli.md](./contracts/admin-cli.md)
y [data-model.md](./data-model.md).

## Requisitos

- Lo del MVP: Node ≥ 24, pnpm 10 y Docker.
- PostgreSQL y Valkey de desarrollo:

  ```bash
  docker compose up -d
  ```

- La API con la base de datos (`DATABASE_URL` como en `.env.example`), que aplica las migraciones
  al arrancar:

  ```bash
  pnpm dev
  ```

## Escenarios

| # | Historia | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | P1 | `admin org create --name Prueba --plan organization` y `admin key create Prueba` | Se muestra la clave completa una vez y su `id`; `admin key list Prueba` muestra el `id` y nunca el secreto |
| 2 | P1 | `POST /v1/clean` con `Authorization: Bearer <clave>` | 200, la misma respuesta que sin clave; cabeceras `RateLimit-*` con los límites del plan `organization` |
| 3 | P1 | La misma petición sin cabecera | 200 con los límites anónimos, como antes de la feature |
| 4 | P1 | Peticiones con `Authorization: Bearer x`, con `Authorization: Basic …`, con la cabecera vacía y con una clave bien formada pero inventada | 401 `auth.invalid` con `WWW-Authenticate: Bearer` y el mismo cuerpo en los cuatro casos |
| 5 | P2 | Crear una segunda clave para `Prueba` y repartir 101 peticiones a `/v1/inspect` entre las dos en una hora | La 101.ª recibe 429 `quota.exceeded` con `Retry-After`, sea cual sea la clave; `/v1/headers` sigue respondiendo 200 |
| 6 | P2 | Con la cuota de `Prueba` agotada, una petición anónima a `/v1/inspect` | 200: las cuotas son independientes |
| 7 | P2 | `admin org set-plan Prueba --plan anonymous` y, 60 s después, una petición con clave | `RateLimit-Limit` del plan anónimo |
| 8 | P3 | `admin key revoke <id>` y, 60 s después, una petición con esa clave | 401 `auth.invalid`; la otra clave de `Prueba` sigue funcionando |
| 9 | P3 | `admin org deactivate Prueba` y, 60 s después, una petición con la otra clave | 401 `auth.invalid`. `admin org activate Prueba` la devuelve a 200 en menos de 60 s |
| 10 | P3 | `admin usage show Prueba` | Recuentos por día, clave y grupo que coinciden con las peticiones atendidas de los escenarios anteriores; sin URLs ni IPs |
| 11 | Borde | Parar PostgreSQL (`docker compose stop postgres`) y hacer una petición con una clave que no esté en caché y otra sin clave | Con clave: 503 `auth.unavailable` y `Retry-After: 30`. Sin clave: 200 |
| 12 | Borde | 30 peticiones con claves inventadas desde la misma IP a `/v1/inspect` | Las 10 primeras, 401; a partir de la 11.ª, 429 por la cuota anónima |
| 13 | Copias | `pg_dump` como indica `infrastructure/README.md`, restaurar en una base vacía y apuntar la API a ella | Las claves activas siguen funcionando; las revocadas siguen revocadas (SC-007) |

## Comprobaciones de privacidad

- Los logs de la API durante los escenarios no contienen ninguna clave completa ni su secreto, ni
  URLs ni IPs. Como mucho aparece el `id` de una clave.
- En la base de datos solo existen las tablas `organizations`, `api_keys` y `usage_daily` (y la de
  control de migraciones), y `api_keys` no tiene ninguna columna con el secreto.
- La web (`pnpm dev`, puerto 4321) no envía `Authorization` en ninguna petición.

## Puertas automáticas

`pnpm lint`, `pnpm typecheck`, `pnpm boundaries`, `pnpm test` (con `DATABASE_URL` para las pruebas
de integración, que sin ella se saltan), `pnpm test:e2e`, `pnpm build`, `pnpm size` y `pnpm lhci`.
Las pruebas de contrato anónimas existentes pasan sin cambios (SC-002).
