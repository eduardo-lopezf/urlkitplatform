# Implementation Plan: Versión 2 de URLkit — análisis técnico avanzado (HTTP Headers, Metadata, TLS, DNS y Security Analysis)

**Branch**: `002-v2-network-analysis` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-v2-network-analysis/spec.md`

## Summary

Cinco herramientas de análisis que consultan la red desde el servidor: HTTP Headers, Metadata,
TLS, DNS y Security Analysis. Siguen siendo gratuitas, sin cuenta y con límites por visitante
anónimo. Todas se construyen sobre la base del MVP, sin añadir ningún servicio ni lenguaje.

La comparación que exige `docs/arquitectura.md` §11 concluye que Node cubre el alcance real, así
que **el servicio de sondas en Python no entra** ([research R1](./research.md)). Cada herramienta
se divide igual que Redirect Inspector:

- una sonda en `apps/api/src/probes/<tool>` observa la red con la misma protección SSRF;
- el núcleo puro `packages/core/src/tools/<tool>` interpreta lo observado.

HTTP Headers y Metadata reutilizan la cadena del inspector; TLS usa `node:tls` con la IP
validada; DNS consulta por DoH a dos resolutores validadores fijos. Security Analysis combina las
cuatro en una lista de hallazgos ordenada por gravedad, sin veredicto. La API `/v1` crece de forma
compatible con cinco endpoints. Los criterios de evaluación se versionan en el catálogo de reglas
(1.3.0).

## Technical Context

**Language/Version**: TypeScript en modo estricto; Node.js ≥ 24 (probado en 26.5.0, OpenSSL
3.6.3); mismos navegadores que el MVP. Sin Python (research R1)

**Primary Dependencies**: las del MVP (Astro + Vue 3, Hono + `@hono/zod-openapi` + Zod, `undici`,
`tldts`, `punycode`, OpenTelemetry). Nuevas, cada una justificada en research:

- `parse5` en `packages/core`, para analizar HTML según el estándar (R4);
- `dns-packet` en `apps/api`, para el formato binario de DNS con EDNS y EDE (R6);
- `@peculiar/asn1-x509` y `@peculiar/asn1-schema` en `apps/api`, para las extensiones X.509 y
  las SCT (R5).

**Storage**: sin base de datos. Valkey solo para contadores de cuota, con cinco claves nuevas en
el plan anónimo (R9). Sin caché de resultados

**Testing**: Vitest (núcleo con observaciones sintéticas, catálogo, contrato, API con servidores
HTTPS y DoH locales, SSRF parametrizada por conector); Playwright + axe; `size-limit`;
Lighthouse CI. Conjuntos de referencia contra la red real fuera de CI, registrados en
`validation/` (R13)

**Target Platform**: la misma que el MVP. Web estática en CDN y contenedor OCI de la API detrás de
Caddy y `egress-guard`. Sin cambios de infraestructura: todo el tráfico saliente usa 443 (o los
puertos que ya permite el inspector)

**Project Type**: aplicación web (monorepo existente: web estática + API + paquetes compartidos)

**Performance Goals**: el 95 % de las peticiones de HTTP Headers, Metadata, TLS y DNS, en menos de
5 s; el de Security Analysis, en menos de 10 s (SC-001). Las páginas nuevas cumplen el
presupuesto de carga (< 1 s en 4G) y el de JS inicial (< 150 KB) del MVP

**Constraints**:

- Protección SSRF completa en todo conector que llegue a un destino elegido por la persona.
- Sin URLs, cabeceras, documentos, certificados ni registros en logs ni trazas.
- Los valores de las cookies nunca se devuelven.
- La web no carga recursos de terceros que aparezcan en un resultado.
- Cuerpo leído: como máximo 1 MiB para Metadata y 256 KB en el resto de saltos (como el MVP).
- WCAG 2.2 AA, desde 320 px, es/en.

**Scale/Scope**:

- 5 herramientas nuevas, 10 páginas (5 × 2 idiomas) y 5 endpoints.
- Escala inicial dentro de la que ya se dimensionó para el inspector: hasta 20.000 análisis de red
  al día en total.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cómo lo cumple el plan | Estado |
|---|---|---|
| I. Herramientas modulares | Cada herramienta es un módulo `packages/core/src/tools/<id>` con su sonda en `apps/api/src/probes/<id>`. Se registra en el registro común, que gana cinco `ToolId` ([tool-registry.md](./contracts/tool-registry.md)). Las del MVP no se modifican: solo se amplía su lista `sendTo` | ✅ |
| II. Corrección según estándares | La URL se sigue analizando en el núcleo (WHATWG). HTML con `parse5` y detección de codificación del estándar HTML (R4). Formato DNS de las RFC 1035, 6891, 8484 y 8914 (R6). Errores explícitos con códigos | ✅ |
| III. Minimalismo funcional | Una página por herramienta, mismos componentes de `packages/ui`, sin vistas previas cargadas de terceros, copiar con un clic, AA con axe | ✅ |
| IV. API-first y SaaS | Cinco endpoints `/v1` con OpenAPI ([openapi.yaml](./contracts/openapi.yaml)) como ampliación compatible. Mismo `apiKey` opcional, mismo `Subject`, plan separado del núcleo (`apps/api/src/quota/plans.ts`) y `catalogVersion` en las respuestas que dependen del catálogo | ✅ |
| V. Privacidad y seguridad | Ningún conector nuevo sin la protección completa. El de TLS reutiliza `resolveTarget` y pasa los vectores compartidos. DNS no conecta con el destino y rechaza los nombres de uso especial (R11). Sin almacenamiento ni caché, sin valores de cookies, salidas escapadas, `InertLink` para las URL externas y límites por herramienta (R9). `docs/privacidad.md` se actualiza con la implementación | ✅ |
| VI. Calidad con pruebas | Pruebas primero en el núcleo con observaciones sintéticas. Servidores HTTPS y DoH locales para la integración. Contrato en ambos lados. E2E con axe en las páginas nuevas (R13) | ✅ |
| VII. Simplicidad | Sin servicio nuevo, sin lenguaje nuevo, sin infraestructura nueva. Cuatro dependencias pequeñas, cada una justificada frente a la alternativa de escribirla (R4–R6). Entrega herramienta a herramienta | ✅ |
| VIII. Adaptadores delgados | Las sondas solo observan; el núcleo evalúa cabeceras, elige el valor efectivo de los metadatos, nombra los problemas del certificado, decide el estado DNSSEC, elige qué hosts revisar y gradúa los hallazgos (R2, R7). Los manejadores de ruta siguen la secuencia validar → identificar → cuota → invocar → medir → responder | ✅ |
| IX. Fronteras explícitas | Sin frontera nueva entre procesos (R1). Las fronteras con terceros (resolutores DoH) tienen modos de fallo declarados: reserva, tiempos y `503` (R6, R10). Los criterios nuevos del catálogo tienen JSON Schema | ✅ |
| X. Datos declarativos versionados | Criterios de cabeceras, TLS, precedencia de metadatos y gravedades en `packages/rules` (catálogo 1.3.0, MINOR, *lock* actualizado). Códigos nuevos estables con textos es/en. Reutilización explícita de `inspect.blocked.*` con su significado publicado (R8, R10) | ✅ |
| Restricciones (rendimiento, i18n) | `size-limit` y Lighthouse CI cubren las páginas nuevas; `parse5` no se carga en ninguna página web. Textos en `packages/i18n` | ✅ |

**Resultado de la puerta (antes de la fase 0)**: PASA, sin infracciones que justificar.

**Revisión tras la fase 1**: PASA.

- El modelo de datos no persiste nada.
- El contrato solo añade cosas: endpoints, valores de `enum` y esquemas.
- Ninguna respuesta incluye valores de cookies ni recursos que la web vaya a cargar.
- La única pieza que cambia de sitio es la decisión de arquitectura de §11. Se cierra en la
  dirección que el propio documento prevé, y `docs/arquitectura.md` se actualiza en la primera
  tarea de la fase de base, antes que el código.

## Project Structure

### Documentation (this feature)

```text
specs/002-v2-network-analysis/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas (R1–R14)
├── data-model.md        # Fase 1: observaciones, resultados y hallazgos
├── quickstart.md        # Fase 1: guía de validación
├── contracts/
│   ├── openapi.yaml     # Ampliación de /v1: cinco endpoints y sus esquemas
│   ├── tool-registry.md # Cambios en el registro de herramientas y en ToolContext
│   └── web-routes.md    # Páginas nuevas y "Enviar a"
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks; no lo crea este comando)
```

### Source Code (repository root)

Solo se muestran los directorios nuevos (`+`) o modificados (`~`); el resto es el árbol de la
[feature 001](../001-mvp-url-toolkit/plan.md).

```text
packages/
├── core/
│   ├── src/
│   │   ├── codes.ts                 ~ códigos headers.*, metadata.*, tls.*, dns.*, security.*
│   │   ├── registry.ts              ~ ToolId ampliado; ToolContext con fetchChain, probeTls, queryDns
│   │   ├── url/host.ts              + host para DNS/TLS: Unicode/ASCII, IP literal, nombres de uso especial
│   │   └── tools/
│   │       ├── headers/             + evaluación de cabeceras de seguridad y cookies (sin valores)
│   │       ├── metadata/            + codificación, parse5, extracción y valor efectivo
│   │       ├── tls/                 + problemas del certificado a partir de la observación
│   │       ├── dns/                 + registros, estado DNSSEC, existe/no existe/fallo
│   │       └── security/            + reviewTargets() y review() → hallazgos ordenados
│   └── tests/unit/                  + una suite por herramienta, con observaciones sintéticas
├── rules/
│   ├── data/security/               + headers.json, severities.json, tls.json
│   ├── data/metadata/               + precedence.json
│   ├── schema/                      ~ esquema de criterios
│   ├── build/compile.ts             ~ compila los criterios y los expone con la versión
│   └── package.json                 ~ versión 1.3.0 (+ catalog.lock.json)
├── contracts/src/v1/                + headers.ts, metadata.ts, tls.ts, dns.ts, security.ts
│                                    ~ common.ts (ToolId), errors.ts (si hace falta)
├── i18n/src/{es,en}.json            ~ textos de los códigos nuevos y de las páginas
└── ui/                              (sin cambios previstos; si hace falta un componente se añade aquí)

apps/
├── api/
│   ├── src/
│   │   ├── inspect/safe-fetch.ts    ~ transporte con rawHeaders (dispatch) y lectura de cuerpo configurable
│   │   ├── probes/
│   │   │   ├── chain.ts             + cadena del inspector que conserva cabeceras y cuerpo del salto final
│   │   │   ├── tls/connect.ts       + conector TLS con IP validada (resolveTarget de inspect/ssrf.ts)
│   │   │   ├── tls/x509.ts          + extensiones y SCT con @peculiar/asn1-x509
│   │   │   └── dns/doh.ts           + cliente DoH a resolutores fijos con dns-packet
│   │   ├── routes/v1/               + headers.ts, metadata.ts, tls.ts, dns.ts, security.ts
│   │   ├── quota/plans.ts           ~ cinco límites nuevos
│   │   └── app.ts                   ~ AppDeps con las sondas nuevas
│   └── tests/
│       ├── fixtures/tls/            + certificados de prueba generados con openssl (+ script)
│       ├── fixtures/dns/            + respuestas DoH grabadas
│       ├── ssrf/                    ~ vectores ejecutados contra safeFetch y el conector TLS
│       ├── contract/                ~ cinco endpoints contra openapi.json
│       └── integration/             + servidor HTTPS local y DoH falso
└── web/
    ├── src/pages/[lang]/            + headers, metadata, tls, dns, security
    ├── src/islands/                 + una isla por herramienta
    ├── src/lib/api.ts               ~ callTool(tool, body) genérico
    └── tests/e2e/                   + cinco recorridos con axe

docs/
├── arquitectura.md                  ~ §2 tabla v2 y §11 cerrada con la comparación de R1
└── privacidad.md                    ~ qué llega al servidor en cada herramienta; resolutores DoH

CLAUDE.md                            ~ estado de la v2; services/probes ya no es de la v2
```

**Structure Decision**: el monorepo no cambia de forma; solo crecen dos piezas.

- `apps/api/src/probes/` agrupa las sondas nuevas. `apps/api/src/inspect/` se queda con lo que ya
  es suyo y con lo que se comparte (`ssrf.ts`, `safe-fetch.ts`), y las sondas lo importan. No se
  mueve el código del MVP, para no tocar lo que funciona (cambios quirúrgicos).
- Las reglas de dependencia del plan de la 001 siguen igual. `parse5` es una dependencia externa
  del núcleo, como `tldts`; el núcleo sigue sin importar nada del repositorio salvo tipos.
  `pnpm boundaries` lo comprueba.

## Delivery Order

Incrementos utilizables, en el orden de prioridad de la spec (Principio VII):

0. **Requisito previo** (fuera de este plan): cerrar T103 y T111–T114 de la feature 001, para
   medir la v2 sobre el MVP desplegado (spec, Assumptions).
1. **Base**:
   - actualizar `docs/arquitectura.md` §2 y §11 (R1);
   - criterios en el catálogo 1.3.0 (R8);
   - `ToolId` y `ToolContext` ampliados;
   - transporte con `rawHeaders`;
   - `callTool` en la web;
   - claves de cuota.
2. **P1 HTTP Headers**: núcleo, sonda de la cadena, endpoint, página y e2e. **Primer lanzamiento
   posible de la v2.**
3. **P2 Metadata**: reutiliza la cadena de P1 y añade la lectura del documento y `parse5`.
4. **P3 TLS**: conector nuevo y vectores SSRF parametrizados.
5. **P4 DNS**: cliente DoH y resolutor falso de pruebas.
6. **P5 Security Analysis**: `reviewTargets`, `review`, orquestación con presupuestos de tiempo y
   página.
7. **Cierre**:
   - "Enviar a" entre las diez herramientas;
   - `docs/privacidad.md` y `CLAUDE.md`;
   - conjuntos de referencia (SC-003 a SC-006) registrados en `validation/`.

## Complexity Tracking

Sin infracciones de la constitución que justificar.
