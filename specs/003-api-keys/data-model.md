# Data Model: Versión 3, primera parte — claves de API y cuotas por plan

Primera persistencia del producto. Todo lo que se guarda está en esta página; nada de lo que se
envía a las herramientas se guarda (FR-040). Decisiones en [research.md](./research.md).

## Tablas (PostgreSQL, dueño `apps/api`)

### `organizations`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` | Clave primaria, generada al crear |
| `name` | `text` | Obligatorio, 1–100 caracteres, único sin distinguir mayúsculas |
| `note` | `text` | Opcional, hasta 500 caracteres. Nota interna del operador; nunca datos personales de contacto (FR-041) |
| `plan_id` | `text` | Obligatorio. Debe existir en `plans.json` al asignarse (R4) |
| `status` | `text` | `active` o `inactive` |
| `created_at` | `timestamptz` | Obligatorio |
| `deactivated_at` | `timestamptz` | Solo si `status = inactive` |

### `api_keys`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | `text` | Clave primaria. El identificador corto y público de la clave: 12 caracteres base32 en minúsculas (R2) |
| `organization_id` | `uuid` | Obligatorio, clave foránea a `organizations.id` |
| `secret_hash` | `bytea` | SHA-256 del secreto, 32 bytes. Nunca el secreto (FR-003) |
| `created_at` | `timestamptz` | Obligatorio |
| `revoked_at` | `timestamptz` | Nulo mientras está activa. Una vez fijado no vuelve a ser nulo (FR-006) |

### `usage_daily`

| Columna | Tipo | Reglas |
|---|---|---|
| `day` | `date` | Día UTC |
| `organization_id` | `uuid` | Clave foránea a `organizations.id` |
| `key_id` | `text` | Clave foránea a `api_keys.id` |
| `bucket` | `text` | Grupo de cuota (`inspect`, `local`, `headers`, `metadata`, `tls`, `dns`, `security`) |
| `count` | `integer` | ≥ 1 |

Clave primaria: `(day, key_id, bucket)`. Solo números: sin URLs, consultas, contenido ni IPs
(FR-032). Las filas con `day` de más de 13 meses se borran solas (FR-033, R6).

## Planes (`apps/api/src/quota/plans.json`, versionado con el código)

```text
Plan
├── id: string                         'anonymous' | 'organization' | …
└── limits: { [bucket]: { hour?: n, day?: n } }
```

- `anonymous` es el plan actual del MVP y la v2, sin cambios.
- `organization` es el plan inicial para claves (valores en R4).
- Un plan sin límite para un grupo hereda el de `anonymous` (FR-025). Ningún grupo queda ilimitado.
- Un esquema JSON valida el fichero en las pruebas.

## Estados

```text
Organización:  active ⇄ inactive          (desactivar y reactivar; nunca se borra en esta parte)
Clave:         active → revoked            (definitivo)
```

Una clave **funciona** solo si ella está activa y su organización también. Revocar o desactivar
surte efecto en menos de un minuto en todas las instancias (caché de 30 s, R3).

## Identidad de una petición

```text
Sin cabecera Authorization  →  Subject { type: 'anon-ip', hash }                   (como hoy)
Bearer válida               →  Subject { type: 'organization', organizationId }    (cuota común, R5)
                               + keyId, solo para medir el consumo (R6)
Cabecera presente no válida →  401 auth.invalid, consumiendo cuota anónima          (R8)
Base de datos no disponible →  503 auth.unavailable, Retry-After: 30                (R8)
```

El núcleo no recibe nada de esto (FR-045): la identidad se resuelve en `apps/api` y solo decide
qué sujeto pasa al limitador.

## Caché de verificación (memoria del proceso)

| Campo | Contenido |
|---|---|
| Clave de la caché | `keyId` |
| Valor | `{ valid: false }` o `{ valid: true, organizationId, planId, secretHash }` |
| Vida | 30 s |
| Tamaño máximo | 10.000 entradas |

Guarda el resumen para comparar el secreto de cada petición; nunca el secreto ni la clave completa.

## Lo que no se guarda

- La clave completa ni su secreto, en ningún sitio.
- URLs, consultas, cuerpos de petición, resultados, cabeceras ni IPs.
- Datos personales de las organizaciones.
- Registros de cada petición: el consumo son recuentos diarios.
