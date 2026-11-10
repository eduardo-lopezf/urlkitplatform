# URLkit

Herramientas de URLs rápidas, privadas y sin cuenta. Pega un enlace y obtén al instante una
versión limpia, su estructura, su explicación o su cadena de redirecciones.

> **Estado**: MVP implementado y en validación. Las cinco herramientas, la API `/v1` y la web
> funcionan en local con todas las puertas de calidad en verde; falta la prueba de usabilidad con
> personas (SC-007) y el despliegue. No hay versión publicada todavía.

## Qué resuelve

| Herramienta            | Qué hace                                                                                               | Dónde se ejecuta |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ---------------- |
| **Smart Cleaner**      | Quita parámetros de seguimiento y desenvuelve URLs de redirección, explicando qué se eliminó y por qué | Navegador        |
| **URL Parser**         | Descompone una URL en sus partes, permite editarlas y la reconstruye al momento                        | Navegador        |
| **Redirect Inspector** | Sigue la cadena de redirecciones desde el servidor y muestra cada salto                                | Servidor         |
| **URL Diff**           | Compara dos URLs por componente y parámetro                                                            | Navegador        |
| **Explain URL**        | Explica cada parte de una URL y señala avisos, con reglas fijas y sin IA                               | Navegador        |

## Principios de producto

- **Gratis y sin cuenta** para limpiar e inspeccionar. Sin publicidad y sin muro de registro.
- **Las URLs no salen de tu navegador** en cuatro de las cinco herramientas. La única que necesita
  servidor es Redirect Inspector, porque alguien tiene que seguir los saltos por ti.
- **Sin cookies, sin seguimiento, sin banner de consentimiento.** La medición es agregada y
  anónima.
- **Nada se almacena**: ni las URLs que envías, ni los registros del servidor las contienen.
- **API pública documentada** para las cinco herramientas desde el primer día.

Los compromisos de privacidad, en detalle y con lo que implican, están en
[docs/privacidad.md](docs/privacidad.md).

## Arquitectura

Un núcleo TypeScript puro implementa la lógica de URLs y se ejecuta igual en el navegador y en el
servidor, con una sola implementación. La web es estática (Astro con islas Vue 3) y se sirve desde
CDN; la API es un servicio Node sin estado (Hono) que expone las cinco herramientas en `/v1`.

El documento completo, con la pila por etapas y las decisiones de frontera, está en
[docs/arquitectura.md](docs/arquitectura.md).

```text
packages/core        Lógica pura de URLs (navegador + servidor)
packages/rules       Catálogo de reglas de limpieza, versionado aparte
packages/contracts   Esquemas de /v1 y OpenAPI generado
packages/i18n        Textos es/en por código de mensaje
packages/ui          Tokens de diseño y componentes Vue
apps/web             Astro estático + islas Vue
apps/api             Node + Hono, sin estado
```

## Desarrollo

Requisitos: Node >= 24 y pnpm 10. Docker es opcional en desarrollo: sin `REDIS_URL` la API
guarda los contadores de cuota en memoria (en producción Valkey es obligatorio).

```bash
pnpm install
docker compose up -d   # opcional: Valkey en localhost:6379 (exporta REDIS_URL=redis://localhost:6379)
pnpm dev
```

La web queda en `http://localhost:4321` y la API en `http://localhost:8787`.

Para probar la API como en producción (contenedor con Valkey) y la web en local, usa
`pnpm dev:container` en lugar de `pnpm dev`. Construye la imagen si hace falta, arranca la API y
Valkey con `docker compose --profile full`, y después la web. Si no defines `QUOTA_SECRET`, genera
uno aleatorio. La web se cierra con Ctrl+C (o `pnpm --filter @urlkit/web exec astro dev stop` si
Astro la dejó en segundo plano) y los contenedores siguen en marcha:
`docker compose stop api` libera el puerto 8787 para volver a `pnpm dev`.

Las pruebas de extremo a extremo usan el Chromium de Playwright; para usar el Chrome instalado:
`PW_CHANNEL=chrome pnpm test:e2e`.

Guía de contribución y puertas de calidad: [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentación

| Documento                                                          | Para qué                                          |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| [.specify/memory/constitution.md](.specify/memory/constitution.md) | Los principios irrenunciables del proyecto        |
| [docs/arquitectura.md](docs/arquitectura.md)                       | Arquitectura, pila por etapas y fronteras         |
| [docs/privacidad.md](docs/privacidad.md)                           | Qué se mide, qué no se guarda y por qué           |
| [specs/001-mvp-url-toolkit/](specs/001-mvp-url-toolkit/)           | Especificación, plan, decisiones y tareas del MVP |
| [SECURITY.md](SECURITY.md)                                         | Cómo reportar una vulnerabilidad                  |

## Hoja de ruta

- **MVP** — las cinco herramientas, gratis y sin cuenta, con API anónima documentada.
- **v2** — análisis técnico avanzado: DNS, TLS, cabeceras HTTP, metadatos y seguridad.
- **v3** — plataforma: reputación, análisis por lotes, informes, historial opcional con cuenta y
  API de pago para automatización.

## Licencia

Pendiente de decidir. Hasta que se publique un fichero `LICENSE`, todos los derechos reservados.

El catálogo de reglas es propio. Las listas públicas de parámetros de seguimiento (ClearURLs,
AdGuard) se usan solo como referencia de contraste, y cualquier dato importado requiere revisión
de licencia previa. Los vectores de Web Platform Tests se usan bajo licencia BSD-3, indicada junto
a ellos.
