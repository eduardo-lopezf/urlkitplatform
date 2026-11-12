# Contract: rutas web nuevas (v2)

**App**: `apps/web` | **Feature**: [spec.md](../spec.md) | **Base**: [rutas de la 001](../../001-mvp-url-toolkit/contracts/web-routes.md)

## Rutas

| Ruta | Herramienta | Ejecución |
|---|---|---|
| `/{lang}/headers` | HTTP Headers | API `POST /v1/headers` |
| `/{lang}/metadata` | Metadata | API `POST /v1/metadata` |
| `/{lang}/tls` | TLS | API `POST /v1/tls` |
| `/{lang}/dns` | DNS | API `POST /v1/dns` |
| `/{lang}/security` | Security Analysis | API `POST /v1/security` |

La página de inicio y la lista de herramientas incluyen las cinco nuevas, agrupadas como "Análisis
técnico". El campo único de inicio puede sugerirlas, pero nunca lanza un análisis de red por sí
solo.

## Fragmento compartible

| Herramienta | Fragmento |
|---|---|
| headers, metadata, tls, security | `#u=<url>` |
| dns | `#u=<url o nombre>&t=host\|registrable` |

Las cinco piden pulsar "Analizar" para enviar nada. Abrir un enlace compartido carga la entrada,
pero **no lanza** la petición a la API (igual que Redirect Inspector).

## Comportamiento común

- La entrada viaja en el cuerpo del POST, nunca en la ruta ni en la consulta.
- Las URL de imágenes, iconos y la canónica de Metadata se muestran como texto con `InertLink`. No
  se crea ningún `<img>` ni ningún `<link>` hacia ellas.
- Los valores de las cabeceras, los metadatos y los registros TXT se muestran como texto escapado.
- Cada resultado copiable tiene "Copiar"; la tabla de cabeceras y los registros DNS se pueden
  copiar enteros como texto.
- Al agotar el límite se muestran el límite y el tiempo de espera. Las demás herramientas siguen
  disponibles.
- Security Analysis enumera siempre lo que no se comprueba (reputación, contenido), justo debajo
  de la lista de hallazgos.
