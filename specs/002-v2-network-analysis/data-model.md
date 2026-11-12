# Data Model: Versión 2 — análisis técnico avanzado

**Feature**: [spec.md](./spec.md) | **Date**: 2026-11-10

La v2 sigue **sin base de datos**. Las entidades son estructuras en memoria que la API serializa
en JSON. Solo se persisten dos cosas, como en el MVP:

- los criterios del catálogo de reglas, que son ficheros del repositorio;
- los contadores de cuota, en Valkey y con caducidad.

Ninguna entidad persistida contiene URLs, dominios ni IPs en claro.

Cada herramienta tiene dos formas, por la división de [research R2](./research.md):

- la **observación** la produce la sonda de `apps/api/src/probes/` y no sale del servidor;
- el **resultado** lo produce el núcleo y es lo que publica el contrato.

Se mantienen las convenciones de la [001](../001-mvp-url-toolkit/data-model.md): `MessageRef`,
`ToolError` y `RedirectChain` no cambian, y los textos visibles no forman parte del modelo.

```text
Severity = 'high' | 'medium' | 'low' | 'info'
```

## Observaciones (internas, no se publican)

| Observación | Campos | Notas |
|---|---|---|
| `ChainObservation` | `chain: RedirectChain`, `finalResponse: { status, rawHeaders: [name, value][], body: Uint8Array \| null, bodyTruncated: boolean, contentType: string \| null } \| null` | La sonda conserva solo las cabeceras y el cuerpo del salto final. Cuerpo ≤ 1 MiB para Metadata y `null` para Headers |
| `TlsObservation` | `observedAt` (ISO 8601), `host`, `port`, `sniSent: boolean`, `protocol`, `cipher`, `alpn \| null`, `authorized`, `authorizationError \| null`, `hostMatches`, `chain: CertObservation[]` | Ordenada de la hoja a la raíz |
| `CertObservation` | `subject`, `issuer`, `subjectAltNames: string[]`, `serialNumber`, `validFrom`, `validTo`, `signatureAlgorithm`, `fingerprint256`, `isCa`, `selfIssued`, `sct: { status: 'embedded' \| 'absent' \| 'unknown', count: number }` | `sct` solo se calcula para la hoja |
| `DnsObservation` | `observedAt`, `name` (ASCII), `resolver: 'cloudflare' \| 'quad9'`, `answers: Record<RecordType, DnsAnswer>` | |
| `DnsAnswer` | `rcode`, `ad: boolean`, `ede: { code, text? }[]`, `records: { name, type, ttl, data }[]`, `retriedWithCd: { rcode } \| null`, `transportError: boolean` | Una por tipo consultado |

## HeadersAnalysis (HTTP Headers)

| Campo | Tipo | Notas |
|---|---|---|
| input | string | |
| finalUrl | string \| null | `null` si la cadena no llegó a una respuesta |
| hops | number | Número de saltos seguidos (FR-021) |
| stopReason | el de `RedirectChain` | Si no es `final`, `headers` va vacío y `error` dice por qué |
| status | number \| null | |
| headers | `{ name: string, value: string }[]` | En el orden recibido, con las repeticiones por separado. `Set-Cookie` aparece con `value` sustituido por `"<omitido>"` (R3) |
| security | `HeaderCheck[]` | Una entrada por cada cabecera del catálogo |
| cookies | `CookieCheck[]` | Una por `Set-Cookie` |
| error | MessageRef? | P. ej. `inspect.tls` con acción "Enviar a TLS" |
| catalogVersion | string | |

**HeaderCheck**: `{ header: string, state: 'present' | 'missing' | 'misconfigured' | 'not-applicable', findings: MessageRef[] }`.
Se usa `not-applicable` para HSTS en `http`.

**CookieCheck**: `{ name: string, secure: boolean, httpOnly: boolean, sameSite: 'strict' | 'lax' | 'none' | null, findings: MessageRef[] }`.
El valor de la cookie no forma parte del modelo.

## PageMetadata (Metadata)

| Campo | Tipo | Notas |
|---|---|---|
| input, finalUrl, hops, stopReason | como en HeadersAnalysis | |
| contentType | string \| null | Si no es HTML: `sources` vacío y aviso `metadata.not-html` |
| encoding | `{ label: string, source: 'bom' \| 'header' \| 'meta' \| 'default', warning?: MessageRef }` | R4 |
| truncated | boolean | Se leyó 1 MiB sin llegar al final del documento |
| sources | `{ basic: Record<string,string>, openGraph: Record<string,string[]>, twitter: Record<string,string[]>, links: { canonical?, icon?: string[], alternate?: { hreflang, href }[] }, lang?: string }` | Valores crudos por origen. `og:image` puede repetirse |
| effective | `{ title?, description?, image?, url?, siteName?, type? }` | Cada valor `{ value, from: 'openGraph' \| 'twitter' \| 'basic' }` (FR-031) |
| warnings | MessageRef[] | `metadata.missing-title`, `metadata.missing-image`, `metadata.canonical-cross-domain`, `metadata.image-relative`, `metadata.truncated`… (FR-032) |
| catalogVersion | string | |

Las URL de `sources` y `effective` se resuelven contra la URL final. Todas son texto: la web las
muestra con `InertLink` y no las carga.

## TlsAnalysis (TLS)

| Campo | Tipo | Notas |
|---|---|---|
| input | string | URL o host |
| host | `{ unicode, ascii }` \| `{ ip }` | |
| port | number | 443 por defecto |
| blocked | MessageRef? | `inspect.blocked.*` (R10). Si está presente, el resto va vacío |
| protocol | string \| null | p. ej. `TLSv1.3` |
| cipher | string \| null | |
| alpn | string \| null | |
| sniSent | boolean | `false` con una IP literal |
| trust | `'trusted' \| 'untrusted'` | |
| chain | `Certificate[]` | De la hoja a la raíz |
| problems | MessageRef[] | `tls.expired`, `tls.not-yet-valid`, `tls.self-signed`, `tls.name-mismatch`, `tls.incomplete-chain`, `tls.untrusted-root`, `tls.expiring-soon` (`params.days`), `tls.weak-signature`, `tls.legacy-protocol` (FR-041) |
| transparency | `{ status: 'embedded' \| 'absent' \| 'unknown', count: number }` | FR-043. Solo las SCT incrustadas |
| error | MessageRef? | `tls.timeout`, `tls.refused`, `tls.no-tls`, `tls.handshake-failed` |
| catalogVersion | string | |

**Certificate**: `{ subject, issuer, subjectAltNames, serialNumber, validFrom, validTo, daysRemaining, signatureAlgorithm, fingerprint256, isCa }`.
`daysRemaining` se calcula en el núcleo como `validTo − observedAt` y puede ser negativo.

## DnsLookup (DNS)

| Campo | Tipo | Notas |
|---|---|---|
| input | string | URL o nombre |
| name | `{ unicode, ascii }` | El nombre consultado |
| alternative | `{ unicode, ascii, kind: 'host' \| 'registrable' }` \| null | La otra opción, para ofrecer consultarla (FR-054) |
| outcome | `'exists' \| 'nxdomain' \| 'failed'` | FR-052 |
| dnssec | `'validated' \| 'unsigned' \| 'bogus' \| 'unknown'` | FR-051. `unknown` solo si falló la consulta |
| resolver | `'cloudflare' \| 'quad9'` | R6 |
| records | `Record<'A'\|'AAAA'\|'CNAME'\|'MX'\|'NS'\|'TXT'\|'CAA'\|'SOA', { state: 'ok' \| 'empty' \| 'failed', records: { name, ttl, data }[] }>` | `data` está estructurado por tipo: `{ priority, exchange }` para MX, `{ flags, tag, value }` para CAA, campos SOA, y una cadena para el resto. TXT junta sus fragmentos |
| warnings | MessageRef[] | Información de configuración que usa Security Analysis: `dns.no-caa`, `dns.no-spf`, `dns.no-dmarc` (`_dmarc` TXT) |

DNS no depende del catálogo y no lleva `catalogVersion`.

**Validación de la entrada**: se rechazan con `ToolError` las IP literales (`dns.ip-literal`) y
los nombres de uso especial (`dns.special-use`), antes de consultar nada (R6).

## SecurityReview (Security Analysis)

| Campo | Tipo | Notas |
|---|---|---|
| input | string | |
| finalUrl | string \| null | |
| findings | `Finding[]` | Por gravedad (`high` → `info`) y, a igual gravedad, por herramienta (R7) |
| parts | `Record<'explain'\|'redirects'\|'headers'\|'tls'\|'dns', { state: 'complete' \| 'incomplete' \| 'skipped', reason?: MessageRef }>` | FR-062. `skipped` cuando no aplica, p. ej. TLS en un destino `http` |
| scope | `{ checked: ToolId[], notChecked: ('reputation' \| 'content')[] }` | FR-063. `notChecked` nunca está vacío en la v2 |
| catalogVersion | string | |

**Finding**: `{ code: MessageCode, severity: Severity, tool: ToolId, params?: Record<string, string | number> }`.

No hay ningún campo de nota, puntuación ni veredicto (FR-064).

**Transiciones**: `explain → redirects(+headers) → (tls ∥ dns) → review`. Si la entrada está
bloqueada, `redirects`, `headers`, `tls` y `dns` quedan `skipped` con el motivo del bloqueo. Si se
agota un presupuesto de tiempo, esa parte queda `incomplete` con `security.part-timeout` y las
demás siguen.

## Criterios del catálogo (persistidos en el repositorio)

| Fichero | Contenido | Usado por |
|---|---|---|
| `packages/rules/data/security/headers.json` | Cabeceras evaluadas, umbral de `max-age` de HSTS (31.536.000 s), valores válidos de `X-Frame-Options` y `Referrer-Policy`, fuentes de CSP consideradas inseguras | headers |
| `packages/rules/data/security/tls.json` | `expiringSoonDays: 30`, algoritmos de firma débiles (`sha1`, `md5`), protocolos heredados (`TLSv1`, `TLSv1.1`) | tls |
| `packages/rules/data/security/severities.json` | `{ [code]: Severity }` para cada código que puede ser hallazgo, incluidas las señales de Explain URL | security |
| `packages/rules/data/metadata/precedence.json` | Orden de las fuentes por campo del valor efectivo | metadata |

Validados por esquema en CI y compilados con la versión del catálogo (**1.3.0**). Cambiar un
umbral o una gravedad existente cambia el significado del resultado y es un cambio **MAJOR**,
según la regla del Principio X para las reglas.

## UsageQuota (cuota de uso)

La entidad del MVP no cambia. El plan anónimo añade las herramientas `headers`, `metadata`, `tls`,
`dns` y `security`, cada una con `{ hour: 10, day: 50 }` y la misma forma de clave en Valkey
(research R9).
