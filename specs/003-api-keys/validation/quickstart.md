# Validación: escenarios del quickstart (003/T050)

**Fecha**: 2026-11-13 · API local en el puerto 8788 (`TRUST_PROXY=1`, para simular varios
clientes con `X-Forwarded-For`) contra PostgreSQL 17 en contenedor; CLI con
`node apps/api/src/admin/cli.ts`.

| # | Escenario | Resultado | Observado |
| --- | --- | --- | --- |
| 1 | Crear organización y clave | ✅ | Organización y clave en 1,1 s (SC-001: < 2 min). La clave se muestra una vez; `key list` solo da `id` y fechas |
| 2 | Petición con clave | ✅ | 200, mismo cuerpo que sin clave, `RateLimit-Limit: 6000` (plan `organization`) |
| 3 | Petición sin clave | ✅ | 200, `RateLimit-Limit: 600`, como antes |
| 4 | Cuatro cabeceras no válidas | ✅ | 401 con `WWW-Authenticate: Bearer` y un único cuerpo en los cuatro casos |
| 5 | 101 inspecciones repartidas entre dos claves | ✅ | Las 100 primeras, 200; la 101.ª, 429 `quota.exceeded` con `Retry-After`; `/v1/headers` sigue en 200 |
| 6 | Anónima con la cuota de la organización agotada | ✅ | 200 |
| 7 | `org set-plan … anonymous` y 31 s después | ✅ | `RateLimit-Limit: 600` |
| 8 | `key revoke` y 31 s después | ✅ | La revocada, 401; la otra clave, 200 |
| 9 | `org deactivate`, 31 s; `org activate`, 31 s | ✅ | 401 y después 200 |
| 10 | `usage show` | ✅ | 105 usos en 5 filas (día, clave, grupo); ninguna URL ni IP |
| 11 | PostgreSQL parado | ✅ | Con una clave fuera de caché: 503 `auth.unavailable` y `Retry-After: 30`. Sin clave: 200 |
| 12 | 30 claves inventadas desde una IP a `/v1/inspect` | ✅ | Las 10 primeras, 401; el resto, 429 por la cuota anónima |
| 13 | Copia y restauración | ✅ (automático) | `tests/integration/backup.test.ts` con `pg_dump`/`pg_restore` del contenedor: la clave activa funciona y la revocada sigue revocada |

La primera pasada usó `http://neverssl.com/` como destino de las inspecciones y era muy lenta;
se repitió con `https://example.com/` y una organización nueva. En la segunda pasada el guion leía
las cabeceras distinguiendo mayúsculas (Node las envía en minúsculas) y marcaba como fallo lo que
era correcto; se corrigió el guion y la tercera pasada es la de esta tabla.

## Comprobaciones de privacidad

- El registro de la API durante los escenarios (748 líneas) no contiene ninguna clave, URL ni IP.
- En la base de datos solo están `organizations`, `api_keys`, `usage_daily` y las tablas de control
  de Kysely; `api_keys` guarda el resumen de 32 bytes (prueba de integración `db.test.ts`).
- La web no envía `Authorization` en ninguna petición (e2e en escritorio y a 320 px).

La base de datos de desarrollo conserva las organizaciones de prueba `Prueba`, `Prueba2` y
`Prueba3`. No hay orden para borrar organizaciones en esta parte (se desactivan); para empezar de
cero, `docker compose down` y borrar el volumen `postgres_data`.
