# @urlkit/sdk

Cliente TypeScript para la API de URLkit (`/v1`): limpiar, analizar, comparar y explicar URLs,
inspeccionar redirecciones y analizar cabeceras, metadatos, TLS, DNS y seguridad. Los tipos se
generan desde el contrato público de la API, así que cada llamada, su entrada y su respuesta están
tipadas.

> **Solo para servidores.** Una clave de API en una página web queda a la vista de cualquiera, y la
> API no admite peticiones con clave desde otros orígenes del navegador.

## Instalación

```bash
npm install @urlkit/sdk
```

Necesita Node 24 o posterior (o cualquier entorno de servidor con `fetch` estándar).

Los ejemplos usan `import` y `await` en el nivel superior, así que tu código debe ser un módulo
ES: añade `"type": "module"` a tu `package.json` (`npm init -y` lo crea como CommonJS) o usa la
extensión `.mts` o `.mjs`.

## Primera llamada

```ts
import { createClient } from '@urlkit/sdk';

const urlkit = createClient({ apiKey: process.env.URLKIT_API_KEY });

const { data, rateLimit } = await urlkit.cleanUrl({
  url: 'https://ejemplo.com/?utm_source=boletin&id=1',
});
console.log(data.output); // https://ejemplo.com/?id=1
console.log(rateLimit?.remaining);
```

Sin `apiKey` el cliente usa la API de forma anónima, con los límites gratuitos. Con una clave de tu
organización, usa los límites de su plan.

Para usar otra instancia de la API, por ejemplo una local, indica su dirección con `/v1` incluido:
`createClient({ apiKey, baseUrl: 'http://localhost:8787/v1' })`.

| Opción    | Para qué                                                      |
| --------- | ------------------------------------------------------------- |
| `apiKey`  | Clave de tu organización. Se envía en `Authorization: Bearer` |
| `baseUrl` | Otra dirección de la API (por defecto, la de producción)      |
| `fetch`   | Otra implementación de `fetch`                                |
| `retries` | Reintentos automáticos; ver más abajo                         |

## Herramientas

Un método por herramienta, con el nombre de su operación en el contrato:

| Método                                     | Herramienta        |
| ------------------------------------------ | ------------------ |
| `cleanUrl({ url, mode?, keep? })`          | Smart Cleaner      |
| `parseUrl({ url })`                        | URL Parser         |
| `diffUrls({ a, b, options? })`             | URL Diff           |
| `explainUrl({ url }, { lang? })`           | Explain URL        |
| `inspectRedirects({ url })`                | Redirect Inspector |
| `analyzeHeaders({ url }, { lang? })`       | HTTP Headers       |
| `extractMetadata({ url }, { lang? })`      | Metadata           |
| `analyzeTls({ target }, { lang? })`        | TLS                |
| `lookupDns({ target, scope? }, { lang? })` | DNS                |
| `reviewSecurity({ url }, { lang? })`       | Security Analysis  |

Todos aceptan `{ signal }` para cancelar la llamada. `lang` (`'es'` o `'en'`) añade textos legibles a
los códigos de mensaje de la respuesta.

## Errores y límites de uso

Cada respuesta trae `rateLimit` (`limit`, `remaining`, `resetSeconds`), o `null` si la API no envió
esas cabeceras. Los errores son de dos clases:

```ts
import { UrlkitApiError, UrlkitTransportError } from '@urlkit/sdk';

try {
  await urlkit.inspectRedirects({ url });
} catch (error) {
  if (error instanceof UrlkitApiError) {
    // error.code: 'quota.exceeded', 'auth.invalid', 'auth.unavailable', 'request.invalid',
    // o un código de las herramientas. error.status, error.retryAfterSeconds, error.rateLimit.
  } else if (error instanceof UrlkitTransportError) {
    // error.kind: 'network', 'timeout', 'aborted' o 'invalid-response' (no era la API).
  }
}
```

Decide por `code`, que es estable; el texto puede cambiar. Un código que el SDK no conoce llega tal
cual. Ningún error contiene tu clave.

## Reintentos

Desactivados por defecto. Si los activas, el cliente reintenta solo ante `429` (cuota agotada) y
`503` (servicio no disponible un momento), esperando lo que indica la API:

```ts
const urlkit = createClient({ apiKey, retries: { maxAttempts: 3, maxWaitSeconds: 60 } });
```

- `maxAttempts`: intentos en total, contando el primero (por defecto 3).
- `maxWaitSeconds`: espera máxima que aceptas; si la API pide más, el error llega enseguida (por
  defecto 60). Con la cuota horaria agotada la espera suele ser mayor, así que conviene tratar el
  error.
- Nunca reintenta `401` (clave no válida), otros `4xx`, fallos de red ni llamadas canceladas.

## Versión del contrato

`CONTRACT_VERSION` dice con qué versión del contrato de la API se generó esta versión del SDK.

## Otros lenguajes

El contrato está publicado en `https://api.urlkit.example/v1/openapi.json`: cualquier generador de
clientes OpenAPI produce un cliente para tu lenguaje.

## Privacidad

El SDK no hace ninguna petición que no le pidas: sin telemetría, sin comprobaciones de versión, sin
caché y sin registros.
