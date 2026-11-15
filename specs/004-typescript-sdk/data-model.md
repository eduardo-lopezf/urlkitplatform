# Data Model: Versión 3, segunda parte — SDK de TypeScript

El SDK no guarda nada: no hay persistencia, ni caché, ni estado entre llamadas. Este documento
describe los tipos que maneja. La superficie exacta está en
[contracts/sdk-api.md](./contracts/sdk-api.md).

## Generados (no se escriben a mano)

Salen de `packages/contracts/openapi.json` con `openapi-typescript` y viven en
`packages/sdk/src/generated/openapi.ts` (research R1):

| Tipo | Contenido |
|---|---|
| `paths` | Cada endpoint de `/v1` con su método, parámetros, cuerpo y respuestas por estado |
| `operations` | Las mismas operaciones indexadas por `operationId` |
| `components` | Los esquemas compartidos: `ToolError`, `MessageCode`, los resultados de cada herramienta |

El cliente toma de aquí, para cada `operationId`, el tipo del cuerpo, el de la respuesta `200` y si
admite `lang`. Una prueba compara este fichero con lo que generaría el contrato actual (R2).

## Escritos a mano, sobre los generados

| Tipo | Campos | Reglas |
|---|---|---|
| `ClientOptions` | `apiKey?`, `baseUrl?`, `fetch?`, `retries?` | `baseUrl` sin barra final; `retries` ausente = sin reintentos |
| `RetryOptions` | `maxAttempts` (por defecto 3), `maxWaitSeconds` (por defecto 60) | `maxAttempts` ≥ 1 cuenta el primer intento |
| `CallOptions` | `signal?`, `lang?` | `lang` solo en las operaciones que lo declaran |
| `ToolResponse<T>` | `data: T`, `rateLimit: RateLimit \| null` | `T` es la respuesta `200` generada |
| `RateLimit` | `limit`, `remaining`, `resetSeconds` | `null` si falta alguna de las tres cabeceras |
| `UrlkitApiError` | `code`, `status`, `retryAfterSeconds`, `rateLimit` | `code`: `MessageCode` generado o un código nuevo tal cual |
| `UrlkitTransportError` | `kind`, `status` | `kind`: `network`, `timeout`, `aborted` o `invalid-response` |

## Flujo de una llamada

```text
método(body, options)
  → POST {baseUrl}{path}[?lang=…]   Authorization: Bearer <clave> solo si hay clave
  → 200                    → { data, rateLimit }
  → 4xx/5xx con ToolError  → UrlkitApiError
      429/503, retries activado, Retry-After ≤ maxWaitSeconds, quedan intentos → esperar y repetir
  → otra respuesta         → UrlkitTransportError('invalid-response')
  → fallo de fetch         → UrlkitTransportError('network' | 'timeout' | 'aborted')
```

## Lo que nunca contiene un objeto del SDK

- La clave, salvo en la cabecera de la petición que se envía.
- El cuerpo de la petición ni las cabeceras, dentro de un error.
