# Contrato: superficie pública del SDK

Lo que exporta `@urlkit/sdk` y cómo se comporta. Los tipos de entrada y salida de cada herramienta
no se describen aquí: se generan desde `/v1/openapi.json` ([research R1](../research.md)).

## Creación

```ts
import { createClient } from '@urlkit/sdk';

const urlkit = createClient({
  apiKey: process.env.URLKIT_API_KEY, // opcional: sin ella, uso anónimo
  baseUrl: 'https://api.urlkit.example/v1', // opcional: por defecto, la del contrato
  fetch: globalThis.fetch, // opcional: otra implementación de fetch
  retries: { maxAttempts: 3, maxWaitSeconds: 60 }, // opcional: sin esta opción, no reintenta
});
```

| Opción | Tipo | Por defecto | Notas |
|---|---|---|---|
| `apiKey` | `string` | ninguna | Se envía en `Authorization: Bearer`. El SDK no la valida ni la registra |
| `baseUrl` | `string` | `servers[0].url` del contrato | Sin barra final |
| `fetch` | función con la firma de `fetch` | `globalThis.fetch` | |
| `retries` | `{ maxAttempts?: number; maxWaitSeconds?: number }` | desactivado | Al activarlo: 3 intentos en total y 60 s de espera máxima |

## Métodos

Uno por herramienta de `/v1`, con el nombre de su `operationId`:

| Método | Endpoint | Admite `lang` |
|---|---|---|
| `cleanUrl(body, options?)` | `POST /clean` | — |
| `parseUrl(body, options?)` | `POST /parse` | — |
| `diffUrls(body, options?)` | `POST /diff` | — |
| `explainUrl(body, options?)` | `POST /explain` | sí |
| `inspectRedirects(body, options?)` | `POST /inspect` | — |
| `analyzeHeaders(body, options?)` | `POST /headers` | sí |
| `extractMetadata(body, options?)` | `POST /metadata` | sí |
| `analyzeTls(body, options?)` | `POST /tls` | sí |
| `lookupDns(body, options?)` | `POST /dns` | sí |
| `reviewSecurity(body, options?)` | `POST /security` | sí |

- `body`: el cuerpo de la petición, tipado desde el contrato.
- `options`: `{ signal?: AbortSignal; lang?: 'es' | 'en' }` (`lang` solo donde el contrato lo
  declara).
- Devuelve `Promise<{ data: <respuesta 200 del contrato>; rateLimit: RateLimit | null }>`.

```ts
const { data, rateLimit } = await urlkit.cleanUrl({ url: 'https://ejemplo.com/?utm_source=x' });
data.output; // 'https://ejemplo.com/'
rateLimit?.remaining;
```

## Límites de uso

```ts
interface RateLimit {
  limit: number; // RateLimit-Limit
  remaining: number; // RateLimit-Remaining
  resetSeconds: number; // RateLimit-Reset
}
```

`null` si la respuesta no trae las tres cabeceras.

## Errores

```ts
class UrlkitApiError extends Error {
  readonly name: 'UrlkitApiError';
  readonly code: MessageCode | (string & {}); // código del contrato, o uno más nuevo tal cual
  readonly status: number;
  readonly retryAfterSeconds: number | undefined; // en quota.exceeded y auth.unavailable
  readonly rateLimit: RateLimit | null;
}

class UrlkitTransportError extends Error {
  readonly name: 'UrlkitTransportError';
  readonly kind: 'network' | 'timeout' | 'aborted' | 'invalid-response';
  readonly status: number | undefined; // si hubo respuesta
}
```

- `message` es el código (`'quota.exceeded'`) o el tipo de fallo (`'network'`); nunca contiene
  cabeceras, el cuerpo de la petición ni la clave.
- Una respuesta de error sin cuerpo del contrato (por ejemplo, de un proxy) es un
  `UrlkitTransportError` con `kind: 'invalid-response'` y el `status`.

```ts
try {
  await urlkit.inspectRedirects({ url });
} catch (error) {
  if (error instanceof UrlkitApiError && error.code === 'quota.exceeded')
    await wait(error.retryAfterSeconds);
  else throw error;
}
```

## Reintentos

| Respuesta | Sin `retries` | Con `retries` |
|---|---|---|
| `429`, `503` con `Retry-After` ≤ `maxWaitSeconds` | error | espera y reintenta, hasta `maxAttempts` |
| `429`, `503` con `Retry-After` > `maxWaitSeconds` | error | error, sin esperar |
| `429`, `503` sin `Retry-After` | error | espera 1 s y reintenta |
| `401`, `400`, otros `4xx` | error | error, nunca reintenta |
| Fallo de red, cancelación | error | error, nunca reintenta |

## Otras exportaciones

- `CONTRACT_VERSION`: versión del contrato (`info.version` de `openapi.json`) con la que se generó
  el SDK.
- Los tipos generados (`paths`, `components`, `operations`) para quien los necesite.

## Lo que el SDK no hace

- Ninguna petición que la integración no haya pedido: sin telemetría ni comprobaciones de versión.
- Sin caché ni registros.
- No está pensado para el navegador: una clave en una página web queda expuesta, y CORS no permite
  enviarla desde otros orígenes.
