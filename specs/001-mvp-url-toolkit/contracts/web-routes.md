# Contract: rutas web y enlaces compartibles

**App**: `apps/web` | **Feature**: [spec.md](../spec.md)

## Rutas

| Ruta | Herramienta | Ejecución |
|---|---|---|
| `/` | Detecta el idioma del navegador y redirige a `/es/` o `/en/` | estática |
| `/{lang}/` | Inicio: campo único que sugiere herramienta + lista de herramientas | local |
| `/{lang}/clean` | Smart Cleaner | local |
| `/{lang}/parse` | URL Parser | local |
| `/{lang}/inspect` | Redirect Inspector | API `POST /v1/inspect` |
| `/{lang}/diff` | URL Diff | local |
| `/{lang}/explain` | Explain URL | local |

`{lang}` ∈ `es`, `en`. Cada página tiene un selector de idioma que conserva el fragmento.

## Formato del fragmento compartible (FR-003, FR-005)

La entrada viaja solo en el fragmento (`#`), que el navegador no envía al servidor.

| Herramienta | Fragmento |
|---|---|
| clean | `#u=<url>&m=safe\|max&k=<param1>,<param2>` |
| parse | `#u=<url>` |
| inspect | `#u=<url>` (la inspección requiere pulsar "Inspeccionar"; nunca se lanza sola al abrir el enlace) |
| diff | `#a=<url>&b=<url>&o=<opciones>` |
| explain | `#u=<url>` |

Los valores van codificados con `encodeURIComponent`. "Enviar a" navega a la ruta de destino con
el fragmento `#u=` del resultado (FR-004).

## Comportamiento común de página

- Pegar o escribir procesa al instante (con una espera de 150 ms tras dejar de escribir);
  Redirect Inspector requiere una acción explícita.
- Botón "Copiar" en cada resultado; "Copiar enlace" avisa de que quien lo reciba verá la URL.
- Los resultados nunca se muestran como enlaces activos si el esquema no es `http`/`https`.
- La preferencia de modo de Smart Cleaner se guarda solo en el navegador (`localStorage`,
  tolerante a fallos).
- No hay cookies, banners ni anuncios.
