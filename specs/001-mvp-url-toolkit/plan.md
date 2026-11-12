# Implementation Plan: MVP de URLkit — Smart Cleaner, URL Parser, Redirect Inspector, URL Diff y Explain URL

**Branch**: `001-mvp-url-toolkit` | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-mvp-url-toolkit/spec.md`

## Summary

Cinco herramientas de URLs gratuitas, sin cuenta ni publicidad. Un núcleo TypeScript puro
(`packages/core`) implementa analizar, limpiar, comparar y explicar, y se ejecuta igual en el
navegador y en el servidor. La web estática (Astro con islas Vue 3) usa el núcleo localmente, así
que las URLs no salen del navegador. Solo Redirect Inspector llama a una API Node/Hono sin estado,
con protección SSRF, límites de 10/hora y 50/día por IP seudonimizada y medición agregada sin
cookies. Todas las herramientas se exponen además en una API `/v1` documentada con OpenAPI,
preparada para que la versión 3 añada claves, cuotas y planes de pago sin reescribir nada.
Decisiones y alternativas en [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript en modo estricto; Node.js LTS actual en servidor; navegadores
de las dos últimas versiones principales (Chrome, Edge, Firefox, Safari, incluido iOS)

**Primary Dependencies**: Astro + Vue 3 (`@astrojs/vue`) para la web; Hono + `@hono/zod-openapi`
+ Zod para la API; `undici` (peticiones salientes con DNS controlado); `tldts` (Public Suffix
List); `punycode`; OpenTelemetry para trazas sin URLs

**Storage**: sin base de datos. Redis/Valkey solo para contadores de cuota con caducidad
(memoria local en desarrollo). Catálogo de reglas en JSON versionado en el repositorio

**Testing**: Vitest (núcleo, reglas, contratos, API, contrato, SSRF), Playwright +
`@axe-core/playwright` (extremo a extremo y accesibilidad), `size-limit`, Lighthouse CI,
comprobador de fronteras de dependencia entre paquetes

**Target Platform**: web estática en CDN + contenedor OCI Linux para la API. Arquitectura del
producto y etapas en [`docs/arquitectura.md`](../../docs/arquitectura.md); el MVP se implementa en
un solo lenguaje y sin base de datos

**Project Type**: aplicación web (monorepo: web estática + API + paquetes compartidos)

**Performance Goals**: resultado local < 100 ms (SC-003); inspección de ≤ 5 saltos < 5 s en el
p95 (SC-004); API sin peticiones salientes < 200 ms p95; carga inicial de página < 1 s en 4G

**Constraints**: protección SSRF completa desde el MVP, sin entregas parciales; JS inicial
< 150 KB comprimido por página; URLs nunca almacenadas ni en logs;
sin cookies; entrada máxima de 32.000 caracteres; WCAG 2.2 AA; desde 320 px; es/en;
disponibilidad 99,5 % mensual

**Scale/Scope**: 5 herramientas, ~12 páginas (5 herramientas + inicio, por 2 idiomas); escala
objetivo inicial de 100.000 usos/día de herramientas locales (sin coste de servidor) y hasta
20.000 inspecciones/día

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cómo lo cumple el plan | Estado |
|---|---|---|
| I. Herramientas modulares | Cada herramienta es un módulo de `packages/core/src/tools/<id>` con núcleo puro; se registra en un registro común ([tool-registry.md](./contracts/tool-registry.md)); web y API son adaptadores | ✅ |
| II. Corrección según estándares | `URL` nativa WHATWG validada con vectores WPT; IDN/Punycode, repetidos y codificación conservados; round-trip probado; errores explícitos con códigos | ✅ |
| III. Minimalismo funcional | Una tarea por página; tokens de diseño y componentes Vue en `packages/ui`; WCAG 2.2 AA con axe; 320 px; claro/oscuro; copiar con un clic | ✅ |
| IV. API-first y SaaS | Las 5 herramientas tienen endpoint `/v1` con OpenAPI ([openapi.yaml](./contracts/openapi.yaml)); API sin estado; esquema de autenticación `apiKey` **declarado y opcional** desde la v1; `Subject` como tipo discriminado con las variantes de clave y organización declaradas; `Plan` separado del núcleo en `apps/api/src/quota` ([research R20](./research.md)) | ✅ (ver nota) |
| V. Privacidad y seguridad | Herramientas locales en el navegador; sin URLs en logs; **superficie SSRF completa en el MVP** (IP fijada tras validar, sin seguir redirecciones el cliente, sin proxy, egress restringido) con vectores compartidos entre lenguajes en `tests/ssrf-vectors/` ([research R19](./research.md)); escape de salidas y enlaces inertes para esquemas peligrosos; limitación de tasa | ✅ |
| VI. Calidad con pruebas | Pruebas primero en el núcleo; vectores de casos límite; pruebas de contrato y extremo a extremo; CI bloquea con fallos | ✅ |
| VII. Simplicidad | Sin base de datos ni cuentas; Valkey solo para contadores; un solo lenguaje; entregas por herramienta en orden de prioridad | ✅ |
| VIII. Adaptadores delgados | Los manejadores de `/v1` solo validan, autentican, aplican cuotas, invocan el núcleo, miden y responden; la interpretación de saltos del inspector es núcleo puro ([research R13](./research.md)) | ✅ |
| IX. Fronteras explícitas | `/v1` con OpenAPI generado desde Zod y pruebas de contrato en ambos lados; catálogo de reglas con JSON Schema; claves de Valkey con prefijo versionado ([research R14](./research.md)) | ✅ |
| X. Datos declarativos versionados | Catálogo de reglas con versionado semántico propio e identificadores estables, versión aplicada en cada respuesta; códigos de mensaje estables documentados en el OpenAPI ([research R15](./research.md)) | ✅ |
| Restricciones (rendimiento, i18n) | `size-limit` y Lighthouse CI en CI; textos en `packages/i18n`, núcleo devuelve códigos | ✅ |

**Nota sobre el Principio IV**: la spec deja la "API pública" (claves, cuotas y planes de pago)
para la versión 3. Para no contradecir la constitución, el MVP publica los endpoints `/v1` de las
cinco herramientas, documentados y anónimos, con la misma limitación de tasa. La versión 3 añade
autenticación con claves y planes sobre el mismo contrato, sin cambios incompatibles. Los endpoints
de herramientas locales son para uso programático: la web nunca los llama (FR-006).

**Resultado de la puerta (antes de la fase 0)**: PASA, sin infracciones que justificar.

**Revisión tras la fase 1**: PASA. El modelo de datos no persiste URLs. Los contratos cubren las
cinco herramientas con errores tipados y cabeceras de cuota. El registro de herramientas permite
añadir las de la versión 2 sin tocar las existentes.

**Revisión tras la enmienda 1.2.0 de la constitución** (Principios IV y V ampliados): PASA. La
protección SSRF ya era completa en el diseño; la enmienda prohíbe explícitamente entregarla por
partes y exige los vectores compartidos entre lenguajes, que pasan a ser un artefacto del MVP. El
contrato gana el esquema de autenticación declarado y opcional, y el sujeto de cuota discriminado,
sin cambiar ningún endpoint ni ninguna herramienta.

**Revisión tras la enmienda 1.1.0 de la constitución** (Principios VIII–X): PASA sin cambios de
alcance. Las tres reglas ya estaban implícitas en el diseño; la enmienda las hace verificables en
revisión de código y añade tres obligaciones concretas al plan: la versión del catálogo viaja en
las respuestas que dependen de él, los códigos de mensaje se publican en el OpenAPI con el mismo
identificador que emite el núcleo, y las pruebas de contrato se exigen en ambos lados de `/v1`.

## Project Structure

### Documentation (this feature)

```text
specs/001-mvp-url-toolkit/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas
├── data-model.md        # Fase 1: entidades y validaciones
├── quickstart.md        # Fase 1: guía de validación
├── contracts/
│   ├── openapi.yaml     # API /v1
│   ├── tool-registry.md # Interfaz del registro de herramientas del núcleo
│   └── web-routes.md    # Rutas web y formato de enlaces compartibles
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks; no lo crea este comando)
```

### Source Code (repository root)

```text
package.json                 # Scripts de monorepo (pnpm workspaces)
pnpm-workspace.yaml
docker-compose.yml           # Punto de entrada de desarrollo; apunta a infrastructure/

packages/
├── core/                    # Núcleo puro, sin DOM ni red. Dueño de los códigos de mensaje
│   ├── src/
│   │   ├── registry.ts      # Registro de herramientas
│   │   ├── codes.ts         # Lista de códigos de mensaje (única fuente de verdad)
│   │   ├── url/             # Análisis, normalización, query sin normalizar, dominio registrable
│   │   └── tools/
│   │       ├── clean/       # Smart Cleaner (modos safe/max, envoltorios); recibe el catálogo
│   │       ├── parse/       # URL Parser (descomponer, editar, reconstruir)
│   │       ├── diff/        # URL Diff
│   │       ├── explain/     # Explain URL (reglas → códigos de mensaje)
│   │       └── inspect/     # Tipos y lógica pura de Redirect Inspector (sin red)
│   └── tests/
│       ├── vectors/         # WPT urltestdata.json, casos límite propios
│       └── unit/
├── rules/                   # Catálogo de limpieza, versionado aparte del código
│   ├── data/                # JSON: tracking-params, wrappers, domains/*
│   ├── schema/              # Esquema de validación de reglas
│   ├── build/               # Compilación a módulo optimizado (expone la versión)
│   └── tests/corpus/        # ≥ 200 URLs reales (SC-002)
├── contracts/               # Contratos de frontera (Principio IX)
│   ├── src/v1/              # Esquemas Zod de petición y respuesta por herramienta
│   ├── src/errors.ts        # Códigos de error del contrato, derivados de core/codes.ts
│   ├── openapi.json         # Generado en build; CI verifica que está al día
│   └── tests/               # El esquema acepta/rechaza los ejemplos documentados
├── i18n/                    # Textos es/en indexados por código de mensaje
└── ui/                      # Tokens de diseño y componentes Vue compartidos

apps/
├── web/                     # Astro estático + islas Vue 3 (va a CDN, sin Dockerfile)
│   ├── src/
│   │   ├── pages/[lang]/    # index, clean, parse, inspect, diff, explain
│   │   ├── islands/         # Una isla Vue por herramienta + "Enviar a"
│   │   └── lib/             # Fragmento compartible, cliente de inspect y métricas (beacon)
│   └── tests/e2e/           # Playwright + axe
└── api/                     # Node + Hono, sin estado
    ├── src/
    │   ├── routes/v1/       # clean, parse, diff, explain, inspect, metrics
    │   ├── inspect/         # Cliente HTTP seguro (undici + lookup validado), detector de meta refresh/JS
    │   ├── quota/           # Subject, Plan, limitador por ventanas (Valkey)
    │   ├── privacy/         # HMAC de IP con clave diaria, logger sin URLs
    │   ├── presentation/    # Único módulo que puede importar i18n (parámetro ?lang)
    │   ├── metrics/         # Contadores agregados
    │   └── observability/   # Trazas OTel sin URLs y errores con scrubbing
    ├── tests/
    │   ├── contract/        # Respuestas validadas contra el OpenAPI de packages/contracts
    │   ├── ssrf/            # Destinos internos, DNS rebinding, IPv6
    │   └── integration/
    └── Dockerfile           # El Dockerfile vive con lo que construye

infrastructure/              # Configuración que atraviesa servicios
├── README.md                # Red de egress restringido y su equivalente gestionado
├── caddy/                   # Solo si se autogestiona el despliegue
└── monitoring/              # Prometheus y colector de OpenTelemetry

tests/
└── ssrf-vectors/            # Vectores SSRF como datos, independientes del lenguaje

docs/
└── arquitectura.md          # Arquitectura del producto y etapas
```

Fuera del alcance del MVP, con ubicación ya decidida para no improvisarla después
([`docs/arquitectura.md`](../../docs/arquitectura.md), sección 2):

```text
services/probes/             # sin etapa: la v2 se resolvió en Node (docs/arquitectura.md §11)
tests/contract/              # sin etapa: solo si existe un servicio de sondas aparte
packages/sdk/                # v3: cliente generado desde openapi.json, nunca escrito a mano
```

`tests/ssrf-vectors/` sí existe desde el MVP: son datos, no una suite, y los ejecuta la suite SSRF
de `apps/api`. Desde la versión 2 los ejecutan sus dos conectores, `safeFetch` y el de TLS
(`specs/002-v2-network-analysis/research.md`, R11). Un servicio en otro lenguaje tendría que pasar
los mismos, porque la validación ocurre en el proceso que conecta y no se puede delegar
(Principio V).

### Grafo de dependencias

Las flechas son las únicas dependencias permitidas entre paquetes:

```text
rules ──(tipos)──► core ──(códigos)──► contracts
                    ▲                      │
i18n ──(claves)─────┘                      ▼
                                    [sdk generado] (v3)

apps/web  ──► core, rules, ui, i18n, contracts
apps/api  ──► core, rules, contracts
ui        ──► (nada del dominio)
```

Invariantes, verificadas en CI con un comprobador de fronteras y no solo en revisión:

1. **Solo `apps/api/src/presentation/` puede importar `packages/i18n`**, y únicamente para
   resolver el parámetro opcional `?lang` del contrato. Las rutas y el resto de la API no lo
   importan: devuelven códigos. La respuesta incluye siempre los códigos; el texto es un añadido
   opcional, nunca un sustituto. Así el Principio VIII se cumple —la API no compone texto, lo
   busca en el catálogo cuando el cliente lo pide— sin romper el contrato ya publicado.
2. **`packages/core` no depende de `packages/rules`.** El catálogo se **inyecta** en las funciones
   que lo necesitan; el núcleo solo define sus tipos. Así el núcleo es probable con catálogos
   sintéticos, el catálogo se versiona sin tocar el núcleo, y quien inyecta conoce la versión
   aplicada y puede declararla en la respuesta (Principio X).
3. **`packages/core` no depende de nada del repositorio** salvo tipos; no importa `contracts`,
   `i18n`, `ui` ni `rules`.
4. **`packages/contracts` solo importa de `core` la lista de códigos**, para que el `enum` del
   OpenAPI y lo que emite el núcleo no puedan divergir (Principio X).
5. **`packages/ui` no conoce el dominio.** Recibe datos y emite eventos; no importa `core`.

**Structure Decision**: monorepo de aplicación web con dos apps (`apps/web`, `apps/api`) y cinco
paquetes compartidos. El núcleo está separado de los adaptadores (Principio I) y se reutiliza en
navegador y servidor. Redirect Inspector divide su lógica: el modelo y la interpretación de saltos
son puros (`packages/core/src/tools/inspect`) y la red está solo en `apps/api/src/inspect`.
`packages/contracts` existe para que el contrato `/v1` sea un artefacto propio y no un detalle
interno de la API: lo consumen la API al servir, el navegador al llamar a inspect, las pruebas de
contrato de ambos lados y, en la versión 3, el SDK generado.

Las pruebas viven junto a lo que prueban, para que cada paquete pueda probarse de forma aislada
(Principio I). El `tests/` de la raíz es solo para lo que atraviesa dos unidades de despliegue o
dos lenguajes: en el MVP contiene únicamente `ssrf-vectors/` (datos compartidos entre lenguajes);
las suites de contrato entre `apps/api` y un servicio de sondas solo llegarían si ese servicio
existe, y la versión 2 no lo necesitó.

## Delivery Order

Incrementos utilizables según la prioridad de la spec (Principio VII):

1. Base: monorepo, CI con puertas de calidad (incluido el comprobador de fronteras),
   `packages/contracts`, `packages/ui`, `packages/i18n`, página de inicio.
2. P1 Smart Cleaner (núcleo + reglas + página + endpoint). **Primer lanzamiento posible.**
3. P2 URL Parser.
4. P3 Redirect Inspector (API, SSRF, cuotas, métricas).
5. P4 URL Diff.
6. P5 Explain URL.
7. P6 "Enviar a" y enlaces compartibles entre todas las herramientas.

## Complexity Tracking

Sin infracciones de la constitución que justificar.
