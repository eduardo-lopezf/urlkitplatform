# Quickstart: validar el SDK de TypeScript

Guía para comprobar de principio a fin que el SDK funciona. Superficie en
[contracts/sdk-api.md](./contracts/sdk-api.md).

## Requisitos

- Lo del monorepo: Node ≥ 24 y pnpm 10.
- Para los escenarios con clave: PostgreSQL de desarrollo (`docker compose up -d postgres`) y una
  clave creada con la CLI de la 003.
- Una API local:

  ```bash
  DATABASE_URL=postgres://urlkit:urlkit@localhost:5432/urlkit pnpm --filter @urlkit/api dev
  ```

## Escenarios

| # | Historia | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | P1 | En un script, `createClient({ baseUrl: 'http://localhost:8787/v1' })` y `cleanUrl({ url })` | `data.output` sin `utm_source`; `rateLimit.limit` = 600 (anónimo); la petición sale sin `Authorization` |
| 2 | P1 | Lo mismo con `apiKey` | `rateLimit.limit` = 6000 (plan `organization`) |
| 3 | P1 | Llamar a las diez herramientas | Cada una devuelve su resultado tipado; el editor autocompleta los campos |
| 4 | P1 | Pasar un campo que la herramienta no acepta | `pnpm typecheck` del script falla |
| 5 | P2 | `apiKey: 'uk_inventada…'` y una llamada | `UrlkitApiError` con `code: 'auth.invalid'` y `status: 401`; `String(error)` no contiene la clave |
| 6 | P2 | 11 llamadas anónimas a `inspectRedirects` | La 11.ª: `UrlkitApiError` `quota.exceeded` con `retryAfterSeconds` |
| 7 | P2 | Parar la API y hacer una llamada | `UrlkitTransportError` con `kind: 'network'` |
| 8 | P3 | Cambiar un campo en `packages/contracts` sin regenerar el SDK y ejecutar `pnpm test` | Falla la prueba de contrato al día del SDK, con la orden para regenerar |
| 9 | P4 | Con `retries: { maxAttempts: 2 }` contra un servidor que responde `503` con `Retry-After: 1` y luego `200` | Una espera de 1 s y el resultado; con `401`, una sola petición |
| 10 | Distribución | `pnpm --filter @urlkit/sdk pack` e instalar el `.tgz` en un directorio vacío | `import { createClient } from '@urlkit/sdk'` funciona sin el monorepo |

## Puertas automáticas

`pnpm lint`, `pnpm typecheck`, `pnpm boundaries` (con la regla `sdk-is-standalone`), `pnpm test`,
`pnpm test:e2e`, `pnpm build`, `pnpm size` y `pnpm lhci`. El SDK no afecta a la web, así que `size`
y `lhci` no deben cambiar.
