# Data Model: MVP de URLkit

**Feature**: [spec.md](./spec.md) | **Date**: 2026-11-06

El MVP no tiene base de datos. Las entidades son estructuras en memoria que produce el núcleo
(`packages/core`) y que la API serializa en JSON. Las únicas que se persisten son el catálogo de
reglas (archivos del repositorio) y los contadores de cuota (Redis, con caducidad). Ninguna
entidad persistida contiene URLs ni IPs en claro (FR-005, FR-036).

Convenciones: los textos visibles no forman parte del modelo; se usan **códigos de mensaje**
(`MessageRef`) que `packages/i18n` traduce.

```text
MessageRef = { code: string, params?: Record<string, string | number> }
```

## ParsedUrl (URL analizada)

| Campo | Tipo | Notas |
|---|---|---|
| input | string | Cadena original tras recortar espacios |
| href | string | Serialización normalizada WHATWG |
| schemeAssumed | boolean | `true` si se añadió `https://` (caso límite sin esquema) |
| scheme | string | Sin `:` |
| username | string | Vacío si no hay |
| password | string | Vacío si no hay; la UI lo enmascara por defecto |
| host | { ascii: string, unicode: string, kind: `domain` \| `ipv4` \| `ipv6` \| `opaque` \| `none` } | |
| registrableDomain | string \| null | Según la Public Suffix List; `null` para IPs |
| subdomain | string \| null | |
| port | { value: number \| null, isDefault: boolean } | |
| path | { raw: string, decoded: string, segments: string[] } | |
| query | QueryParam[] | En orden original, con repetidos |
| fragment | string \| null | |
| warnings | MessageRef[] | p. ej. interpretación ambigua entre implementaciones (FR-022) |

**QueryParam**: `{ index: number, name: string, value: string | null, rawName: string, rawValue: string | null, encodingValid: boolean }`.
`value: null` = parámetro sin `=`; cadena vacía = `x=`.

**Validaciones**: longitud de entrada ≤ 32.000; si `new URL()` falla se devuelve `ToolError`
`url.invalid` con la posición o parte problemática; varias URLs en la entrada → se usa la primera
y se añade el aviso `input.multiple-urls`.

## CleaningRule (regla de limpieza)

| Campo | Tipo | Notas |
|---|---|---|
| id | string | Único y estable, p. ej. `tracking.utm`, `wrapper.google-url` |
| kind | `tracking-param` \| `wrapper` \| `domain-rule` | |
| mode | `safe` \| `max` | `safe` se aplica siempre; `max` solo en "limpieza máxima" |
| scope | `global` \| { domains: string[] } | Dominios registrables donde aplica |
| match | depende de `kind` | `tracking-param`: nombres exactos y prefijos (`utm_`); `wrapper`: host + ruta + parámetro de destino (`q`, `url`, `u`); `domain-rule`: patrón de ruta y transformación canónica (p. ej. `/dp/{id}`) |
| exceptions | { domains: string[] } | Dominios donde el parámetro es funcional (p. ej. `ref`) |
| platform | string | p. ej. `Google Ads`, `Meta`, `Mailchimp` |
| reason | MessageRef code | Motivo mostrado en FR-014 |

**Validaciones**: esquema JSON en `packages/rules/schema`; `id` único; toda regla tiene al menos
un caso en el corpus de pruebas; las reglas `domain-rule` siempre son `mode: max`.

## CleanResult (resultado de limpieza)

| Campo | Tipo | Notas |
|---|---|---|
| input | string | |
| output | string | URL limpia |
| mode | `safe` \| `max` | |
| changed | boolean | `false` → "la URL ya está limpia" |
| removed | RemovedItem[] | |
| unwrapped | string[] | Cadena de URLs desenvueltas, de fuera hacia dentro |
| maxPreview | { output: string, extra: RemovedItem[] } \| null | En modo `safe`, lo que añadiría "limpieza máxima" |
| catalogVersion | string | Versión semántica del catálogo de reglas aplicada. Obligatoria: hace el resultado reproducible y auditable (Principio X). La inyecta el adaptador junto con el catálogo |

**RemovedItem**: `{ kind: 'param' | 'wrapper' | 'path', name: string, value?: string, ruleId: string, platform?: string, reason: MessageRef }`.

**Entrada**: `{ url, mode = 'safe', keep: string[] = [] }`. Los nombres de `keep` se conservan
aunque coincidan con una regla (FR-014). El resultado es determinista.

## RedirectChain (cadena de redirecciones)

| Campo | Tipo | Notas |
|---|---|---|
| input | string | |
| hops | Hop[] | Ordenados desde el origen |
| final | string \| null | Último destino alcanzado |
| stopReason | `final` \| `loop` \| `max-hops` \| `blocked` \| `error` \| `timeout` | |
| totalMs | number | |

**Hop**: `{ index, url, status: number | null, type: 'permanent' | 'temporary' | 'meta-refresh' | 'javascript' | 'interstitial' | 'final', location: string | null, durationMs, flags: ('https-downgrade' | 'domain-change')[], error?: MessageRef }`.

**Transiciones**: `pending → fetching → (redirect → fetching)* → final | loop | max-hops | blocked | error | timeout`.
`loop` se detecta al repetirse una URL normalizada; `blocked` cuando la IP resuelta o el destino
no pasan la validación SSRF; las redirecciones `javascript` se detectan y se informan, pero no se
siguen salvo que el patrón sea una asignación literal a `location`. Solo cuenta el contenido de
los `<script>` ejecutables (un atributo como `data-form-location` no es código), y un `meta refresh`
dentro de `<noscript>` no se sigue, porque un navegador con scripts no lo aplica; las entidades HTML
del `content` se decodifican (corregido al validar la 002, 2026-11-12). Un salto `interstitial`
(FR-037, R22) es una respuesta HTML 2xx sin redirección automática que enlaza (`<a href>`) a una
URL idéntica a la que nombra un parámetro de consulta de la propia URL del salto.

## UrlComparison (comparación)

| Campo | Tipo | Notas |
|---|---|---|
| a, b | string | |
| options | { ignoreParamOrder, ignoreTracking, normalize } | Todos `boolean`, por defecto `true`, `false`, `true` |
| equivalent | boolean | Con las opciones elegidas (FR-042) |
| differences | Difference[] | |
| cosmetic | Difference[] | Diferencias eliminadas por la normalización |

**Difference**: `{ component: 'scheme' | 'userinfo' | 'host' | 'port' | 'path' | 'query' | 'fragment', param?: string, change: 'added' | 'removed' | 'modified', before?: string, after?: string }`.

## Explanation (explicación)

| Campo | Tipo | Notas |
|---|---|---|
| url | ParsedUrl | |
| parts | ExplainedPart[] | Un elemento por componente presente |
| signals | Signal[] | Ordenadas por severidad |

**ExplainedPart**: `{ component, value, message: MessageRef, platform?: string }`.

**Signal**: `{ id: 'userinfo-deception' | 'ip-host' | 'homograph' | 'mixed-scripts' | 'excessive-encoding' | 'double-encoding' | 'dangerous-scheme' | 'unusual-port' | 'nested-url' | 'abuse-tld', severity: 'info' | 'caution', message: MessageRef, evidence: string }`.
Nunca hay una severidad de "veredicto" (FR-054).

## UsageQuota (cuota de uso) — persistida con caducidad

| Campo | Tipo | Notas |
|---|---|---|
| key | string | `quota:{tool}:{window}:{windowStart}:{subjectHash}` |
| subjectHash | string | `HMAC-SHA256(IP o prefijo /64, clave_del_día)`, en hexadecimal |
| count | number | |
| ttl | segundos | Igual a lo que queda de la ventana; Redis la borra al vencer |

**Subject** (tipo discriminado, declarado completo desde el MVP aunque solo se implemente la
primera variante):

| Variante | Forma | Etapa |
|---|---|---|
| Visitante anónimo | `{ type: 'anon-ip', hash }` | MVP |
| Clave de API | `{ type: 'api-key', keyId, organizationId }` | v3 |
| Organización | `{ type: 'organization', organizationId }` | v3 (cuota agregada del plan) |

Las cabeceras `RateLimit-*` son idénticas para las tres, y las claves de Valkey incluyen el tipo
de sujeto en el prefijo (`quota:{tool}:{window}:{windowStart}:{subjectType}:{subjectId}`), de modo
que convivir con varios tipos no obliga a migrar los contadores existentes. **Plan**: `{ id: 'anonymous', limits: { inspect: { hour: 10, day: 50 }, local: { hour: 600 }, metrics: { hour: 300 } } }`
(`local` limita solo los endpoints de API de las herramientas locales; la web no los usa;
`metrics` limita `POST /v1/metrics/events`).

## ToolError

`{ code: string, message: MessageRef, part?: string, retryAfterSeconds?: number }`.

Los códigos tienen dos dueños, según la capa responsable (Principios VIII y X):

| Dueño | Códigos | Por qué |
|---|---|---|
| `packages/core` | `url.invalid`, `url.too-long`, `url.unsupported-scheme`, `inspect.blocked`, `inspect.timeout`, `inspect.tls` | Describen semántica de URLs |
| `packages/contracts` | `quota.exceeded`, `request.invalid`, `request.too-large`, `internal.error` y, reservados para la v3, `auth.missing` y `auth.invalid` | Autenticar y limitar es responsabilidad del adaptador, no del núcleo |

Todos se publican en el `enum` del OpenAPI. La prueba de paridad exige que **todo** código del
núcleo esté en el contrato; los del contrato se declaran en `packages/contracts/src/errors.ts` y
se marcan como propios de esa capa.
