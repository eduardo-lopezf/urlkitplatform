# Validación: escenarios del quickstart (004/T023)

**Fecha**: 2026-11-14 · SDK desde su código fuente contra una API local (puerto 8788) con
PostgreSQL; clave creada con la CLI de la 003 para una organización de prueba (`SdkDemo`).

| # | Escenario | Resultado | Observado |
| --- | --- | --- | --- |
| 1 | `cleanUrl` sin clave | ✅ | `output` `https://ejemplo.com/?id=1`, `rateLimit.limit` 600 |
| 2 | `cleanUrl` con clave | ✅ | `rateLimit.limit` 6000 (plan `organization`) |
| 3 | Las diez herramientas con clave, contra la red real | ✅ | Las diez responden: `cleanUrl`, `parseUrl`, `diffUrls`, `explainUrl`, `inspectRedirects`, `analyzeHeaders`, `extractMetadata`, `analyzeTls`, `lookupDns`, `reviewSecurity` |
| 4 | Campo no aceptado | ✅ (automático) | `client.test.ts`: `cleanUrl({})`, `analyzeTls({ target: 42 })` y `lang` en `cleanUrl` no compilan |
| 5 | Clave inventada | ✅ | `UrlkitApiError` `auth.invalid` 401; `String(error)` no contiene la clave |
| 6 | 11 inspecciones anónimas | ✅ | `quota.exceeded` con `retryAfterSeconds` 1418 |
| 7 | API inaccesible | ✅ | `UrlkitTransportError` `network` |
| 8 | Contrato cambiado sin regenerar | ✅ (automático) | Ver `quality-gates.md`, T004 |
| 9 | Reintentos | ✅ | `503` con `Retry-After: 1` → espera 1015 ms → `200`; ante `401`, una sola petición |
| 10 | Paquete instalado fuera del monorepo | ✅ (automático) | `pack.test.ts`: instalado desde el `.tgz` en un directorio vacío, llamada con clave correcta; solo viajan `dist`, `README.md`, `LICENSE.md` y `package.json` |

El registro de la API durante los escenarios no contiene la clave, URLs ni `ejemplo.com`.

## SC-001 (primera llamada en menos de 5 minutos)

No se puede medir sin una persona que no conozca el SDK. Lo que sí se ha comprobado es que el
ejemplo de "Primera llamada" del README funciona tal cual (escenarios 1 y 2): instalar, crear el
cliente y llamar son tres líneas. Queda para una revisión con una persona, junto con la sesión de
usabilidad pendiente (001/T103, 002/T098b).

La base de datos de desarrollo conserva la organización de prueba `SdkDemo`.
