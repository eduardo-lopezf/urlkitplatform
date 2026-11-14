# Validación: puertas de calidad (003/T049, T047)

**Fecha**: 2026-11-13 · **Node**: v26.5.0 · **PostgreSQL**: 17 (contenedor `postgres:17-alpine`)

| Puerta | Resultado |
| --- | --- |
| `pnpm lint` | ✅ sin errores (2 avisos ya existentes en `DiffIsland.vue`) |
| `pnpm typecheck` | ✅ |
| `pnpm boundaries` | ✅ sin violaciones; `packages/core` sin cambios (FR-045) |
| `pnpm test` | ✅ 66 ficheros, 1804 pruebas, ninguna saltada. Con `DATABASE_URL`, `REDIS_URL` y `PG_TOOLS`: corren las pruebas de PostgreSQL, Valkey y copias |
| `pnpm test:e2e` | ✅ 120 pruebas (con `PW_CHANNEL=chrome`), incluida "the web never sends an Authorization header" |
| `pnpm build` | ✅ |
| `pnpm size` | ✅ 143,84 KB (límite 150 KB) |
| `pnpm lhci` | ✅ 11 URL |
| `infrastructure/check-selfhosted.sh` | ✅ con la imagen nueva: cinco servicios, PostgreSQL solo en loopback, reglas de salida que bloquean (contador de DROP 12 → 15), escenario 6 y logs limpios |

La no regresión del uso anónimo (`tests/contract/anonymous-unchanged.test.ts`, escrita antes de
tocar la autenticación) siguió en verde en cada fase (SC-002).

## SC-004: lo que añade una clave al tiempo de respuesta (T047)

`node apps/api/scripts/reference-check.ts --auth-overhead http://localhost:8788 --key <fichero>
--limit 300`, contra una API local con PostgreSQL. Alterna la misma petición a `/v1/clean` sin
clave y con clave; se mide sobre una herramienta local para que la variación de la red no tape la
diferencia.

| Tipo | p50 | p95 |
| --- | --- | --- |
| Sin clave | 1,9 ms | 2,8 ms |
| Con clave | 2,1 ms | 3,0 ms |

Diferencia en el p95: **0,2 ms** (objetivo: ≤ 50 ms). La caché de verificación de 30 s evita la
base de datos en casi todas las peticiones (research R3).

## Fallos encontrados y corregidos al validar

- **Aviso de Kysely en la salida estándar**: `orderBy([...])` está obsoleto en Kysely 0.29 y el
  aviso salía por la salida estándar, rompiendo `usage show --json`. Se encadena un `orderBy` por
  columna (`src/db/usage-store.ts`).
- **Ruta de la CLI en la documentación**: la imagen trabaja en `/repo`, así que la orden es
  `docker compose exec api node apps/api/src/admin/cli.ts …`, no `node src/admin/cli.ts`.
  Corregida en `infrastructure/README.md`, el contrato de la CLI, research R7 y `CLAUDE.md`.
- **Prueba frágil del consumo**: la espera daba por terminadas las escrituras cuando dos lecturas
  coincidían; ahora espera a los recuentos esperados (`vi.waitFor`).
