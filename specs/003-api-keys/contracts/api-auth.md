# Contrato: autenticación con clave en `/v1`

Cambios en la API pública. Todos son **aditivos**: ningún cliente anónimo ve una respuesta
distinta (FR-011, SC-002). La fuente de verdad sigue siendo el OpenAPI generado desde
`packages/contracts`; esto describe lo que cambia en él.

## Lo que ya estaba declarado desde el MVP

- Esquema de seguridad `apiKey`: `type: http`, `scheme: bearer`, `bearerFormat: urlkit-api-key`,
  opcional en todos los endpoints.
- Códigos `auth.missing` y `auth.invalid` en `CONTRACT_CODES`, reservados.
- Cabeceras `RateLimit-Limit`, `RateLimit-Remaining` y `RateLimit-Reset`, y `quota.exceeded` con
  `retryAfterSeconds` y `Retry-After`.

## Petición

```http
POST /v1/headers
Authorization: Bearer uk_<id>_<secreto>
Content-Type: application/json
```

- Formato de la clave: `uk_` + 12 caracteres base32 en minúsculas + `_` + 43 caracteres base64url
  (research R2).
- Sin cabecera `Authorization`: uso anónimo, sin ningún cambio.
- Aplica a todos los endpoints de herramientas: `clean`, `parse`, `diff`, `explain`, `inspect`,
  `headers`, `metadata`, `tls`, `dns` y `security`. `POST /v1/metrics` y `GET /v1/openapi.json` no
  usan clave: la ignoran.

## Respuestas nuevas o con valores nuevos

| Situación | Estado | Cuerpo | Cabeceras |
|---|---|---|---|
| Clave válida | El de siempre | El de siempre | `RateLimit-*` con los límites y el consumo **del plan de la organización** |
| Clave válida, cuota de la organización agotada | 429 | `{ code: 'quota.exceeded', message, retryAfterSeconds }` | `Retry-After`, `RateLimit-*` |
| `Authorization` presente y no válida (vacía, otro esquema, mal formada, inexistente, revocada u organización desactivada) | 401 | `{ code: 'auth.invalid', message: { code: 'auth.invalid' } }`, idéntico en todos los casos | `WWW-Authenticate: Bearer` |
| `Authorization` no válida y cuota anónima de quien la envía agotada | 429 | `quota.exceeded`, como hoy | `Retry-After` |
| Clave no verificable porque el almacenamiento no responde | 503 | `{ code: 'auth.unavailable', message: { code: 'auth.unavailable' } }` | `Retry-After: 30` |

## Cambios en `packages/contracts`

- `CONTRACT_CODES` gana `auth.unavailable` (aditivo; el `enum` `MessageCode` del OpenAPI lo
  incluye).
- Los comentarios de `auth.invalid` dejan de decir "reservado"; `auth.missing` sigue reservado.
- Cada endpoint de herramienta declara las respuestas `401` y `503` con el esquema de error común.
- Sin textos en `packages/i18n`: como el resto de códigos del contrato (`quota.exceeded`,
  `request.*`), son códigos para máquinas y `?lang` no traduce las respuestas de error.

## Lo que no cambia

- La versión de la API (`/v1`), las rutas, los cuerpos de petición y respuesta de las
  herramientas, y todas las respuestas anónimas.
- CORS: solo el origen de la web y solo `content-type`. Las claves no se pueden usar desde un
  navegador de otro origen (research R9).
- La web: no envía `Authorization`.
