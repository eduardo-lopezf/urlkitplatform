# Contrato: herramienta de administración

Interfaz de la CLI del operador (research R7). No está en la API pública ni en la web: se ejecuta
dentro del contenedor de la API.

```bash
docker compose exec api node apps/api/src/admin/cli.ts <orden> [argumentos] [--json]
pnpm --filter @urlkit/api admin <orden> [argumentos] [--json]      # desarrollo
```

Con `--json` la salida es un objeto JSON por orden, para usarla desde otros scripts; sin él, texto
legible. Nunca imprime un secreto salvo en `key create`.

## Órdenes

| Orden | Argumentos | Efecto | Salida |
|---|---|---|---|
| `plans list` | — | Lista los planes de `plans.json` | `id` y límites por grupo |
| `org create` | `--name <texto>` `--plan <id>` [`--note <texto>`] | Crea una organización activa | `id`, `name`, `plan` |
| `org list` | [`--all`] | Lista las organizaciones (solo activas sin `--all`) | `id`, `name`, `plan`, `status`, número de claves activas |
| `org set-plan` | `<org>` `--plan <id>` | Cambia el plan (FR-022) | Plan anterior y nuevo |
| `org deactivate` | `<org>` | Desactiva la organización; todas sus claves dejan de funcionar | `status` |
| `org activate` | `<org>` | Reactiva la organización | `status` |
| `key create` | `<org>` | Crea una clave | **La clave completa, una sola vez**, su `id` y un aviso de que no se volverá a mostrar |
| `key list` | `<org>` | Lista las claves | `id`, `created_at`, `revoked_at`. Nunca el secreto |
| `key revoke` | `<key-id>` | Revoca la clave, de forma definitiva | `id`, `revoked_at` |
| `usage show` | `<org>` [`--from <fecha>`] [`--to <fecha>`] | Consumo por día, clave y grupo (FR-031) | Tabla de recuentos y total |
| `usage prune` | — | Borra recuentos de más de 13 meses (también lo hace la API sola, FR-033) | Filas borradas |

`<org>` acepta el `id` o el nombre exacto de la organización.

## Códigos de salida

| Código | Significado |
|---|---|
| 0 | Hecho |
| 1 | Argumentos no válidos, plan inexistente, organización o clave no encontrada, o nombre repetido. No se cambia nada |
| 2 | La base de datos no responde |

## Reglas

- Todas las órdenes que cambian datos son una sola transacción: o se aplican enteras o nada.
- `key revoke` sobre una clave ya revocada no cambia nada y termina con 0.
- Los errores se escriben en la salida de error, sin datos de las claves.
