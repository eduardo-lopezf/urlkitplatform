# Implementation Plan: Versión 3 de URLkit, segunda parte — SDK de TypeScript para la API

**Branch**: `004-typescript-sdk` | **Date**: 2026-11-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-typescript-sdk/spec.md`

## Summary

Un paquete `@urlkit/sdk` en `packages/sdk/` con el que una integración de servidor llama a las diez
herramientas de `/v1`, con o sin clave, sin escribir a mano peticiones, tipos ni manejo de errores.

Los tipos se **generan** desde `packages/contracts/openapi.json` con `openapi-typescript`, como
exige el Principio IX ([research R1](./research.md)). Encima va un cliente propio y fino sin
dependencias en tiempo de ejecución, que añade:

- un método por `operationId`;
- errores tipados por código del contrato y errores de transporte separados;
- lectura de `RateLimit-*` en cada respuesta;
- reintentos opcionales solo ante `429` y `503`.

Una prueba falla si los tipos generados no coinciden con el contrato actual o si falta el método de
una herramienta (R2). El SDK se prueba contra la API real en proceso, desde `apps/api` (R6). Queda
listo para publicar con una orden, sin publicarse (R7). La API, su contrato y la web no cambian.

## Technical Context

**Language/Version**: TypeScript en modo estricto; Node.js ≥ 24. El paquete publicado es
JavaScript ESM con declaraciones de tipos, utilizable desde cualquier entorno de servidor con
`fetch` estándar

**Primary Dependencies**: ninguna en tiempo de ejecución. De desarrollo, en `packages/sdk`:
`openapi-typescript` (generación de tipos, R1). `apps/api` gana `@urlkit/sdk` como dependencia de
desarrollo, solo para sus pruebas (R6)

**Storage**: N/A. El SDK no guarda nada

**Testing**: Vitest. Unitarias con `fetch` simulado en `packages/sdk/tests/`; contrato al día y
cobertura de operaciones en `packages/sdk/tests/`; contra la API real con `app.request` en
`apps/api/tests/sdk/`; prueba de empaquetado e instalación fuera del monorepo (R6)

**Target Platform**: entornos de servidor (Node ≥ 24 y compatibles con `fetch`). No es para el
navegador

**Project Type**: biblioteca (un paquete nuevo en el monorepo existente)

**Performance Goals**: sin coste añadido apreciable sobre una llamada `fetch` directa; el SDK no
hace trabajo entre llamadas

**Constraints**:

- Tipos de peticiones y respuestas solo generados (FR-020).
- Cero peticiones no pedidas, sin registros ni caché (FR-005).
- La clave nunca en errores ni textos (FR-014).
- Independiente del monorepo: no importa otros paquetes (R8).
- No se publica en esta feature (FR-041).

**Scale/Scope**: 10 métodos, 2 clases de error, un fichero generado y unas doscientas líneas de
cliente.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cómo lo cumple el plan | Estado |
|---|---|---|
| I. Herramientas modulares | Un método por herramienta, derivado del contrato; las herramientas no cambian | ✅ |
| II. Corrección según estándares | `Authorization: Bearer` (RFC 6750), `Retry-After` (RFC 9110) y cabeceras `RateLimit-*` tal como las emite la API | ✅ |
| III. Minimalismo funcional | Sin cambios en la interfaz web | ✅ |
| IV. API-first y SaaS | El SDK es un cliente más de la API pública versionada; no la cambia. Sin clave funciona en anónimo, igual que la API | ✅ |
| V. Privacidad y seguridad | Ninguna petición no pedida, sin telemetría, caché ni registros; la clave no aparece en errores; documentado que no es para el navegador (R4, R5) | ✅ |
| VI. Calidad con pruebas | Pruebas primero; unitarias con `fetch` simulado, contra la API real en proceso y de empaquetado (R6) | ✅ |
| VII. Simplicidad | Una dependencia de desarrollo; ninguna en tiempo de ejecución. Cliente propio de unas doscientas líneas en lugar de un generador de clientes completo (R1) | ✅ |
| VIII. Adaptadores delgados | El SDK no contiene reglas de producto: transporta, tipa y traduce errores por código | ✅ |
| IX. Fronteras explícitas | Es exactamente lo que el principio pide: los tipos del consumidor se generan desde el contrato publicado, con una comprobación que falla si se desfasan (R2). `docs/arquitectura.md` ya lo preveía así para `packages/sdk/` | ✅ |
| X. Datos declarativos versionados | Los códigos de error vienen de la unión generada `MessageCode`; un código nuevo se conserva tal cual. El paquete declara la versión del contrato con la que se generó (R4, R7) | ✅ |
| Restricciones (rendimiento, i18n) | No afecta a la web ni a su presupuesto. `lang` se pasa tal cual donde el contrato lo admite | ✅ |

**Resultado de la puerta (antes de la fase 0)**: PASA, sin infracciones ni desviaciones de
`docs/arquitectura.md`.

**Revisión tras la fase 1**: PASA.

- El SDK no guarda estado ni datos.
- El contrato de la API no cambia; el del SDK ([contracts/sdk-api.md](./contracts/sdk-api.md)) solo
  usa tipos generados más las ayudas.
- Las fronteras ganan una regla (`sdk-is-standalone`), que endurece el grafo.

**Licencia del paquete**: Apache-2.0, decidida por la persona el 2026-11-17 (research R7); el
resto del repositorio sigue con `FSL-1.1-ALv2`.

## Project Structure

### Documentation (this feature)

```text
specs/004-typescript-sdk/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas (R1–R8)
├── data-model.md        # Fase 1: tipos generados y escritos a mano, flujo de una llamada
├── quickstart.md        # Fase 1: guía de validación
├── contracts/
│   └── sdk-api.md       # Superficie pública del SDK
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks; no lo crea este comando)
```

### Source Code (repository root)

```text
packages/sdk/                        + paquete nuevo @urlkit/sdk
├── package.json                     + exports ./src/index.ts; publishConfig → dist; scripts generate, build, prepack
├── tsconfig.json                    + comprobación de tipos, como el resto
├── tsconfig.build.json              + compilación a dist (ESM, declaraciones, rewriteRelativeImportExtensions)
├── vitest.config.ts                 +
├── README.md                        + instalación, cliente con y sin clave, errores, límites, reintentos, no navegador
├── LICENSE                          + Apache-2.0 (R7)
├── scripts/generate.ts              + openapi-typescript sobre packages/contracts/openapi.json
├── src/
│   ├── generated/openapi.ts         + GENERADO: paths, components, operations; no se edita
│   ├── client.ts                    + createClient: un método por operationId, fetch, lang, rateLimit
│   ├── errors.ts                    + UrlkitApiError, UrlkitTransportError
│   ├── retry.ts                     + reintentos ante 429/503 con Retry-After y límites
│   └── index.ts                     + exportaciones públicas y CONTRACT_VERSION
└── tests/
    ├── client.test.ts               + cabeceras, dirección, lang, rateLimit, cero peticiones extra
    ├── errors.test.ts               + errores de la API y de transporte; la clave nunca aparece
    ├── retry.test.ts                + intentos exactos, Retry-After, 401 sin reintento, cancelación
    ├── contract.test.ts             + tipos generados al día y un método por operación de tools
    └── pack.test.ts                 + empaquetar, instalar fuera del monorepo y llamar

apps/api/
├── package.json                     ~ @urlkit/sdk en devDependencies
└── tests/sdk/sdk.test.ts            + el SDK contra la API real (app.request): diez herramientas, con y sin clave, 401/429/503

.dependency-cruiser.cjs              ~ regla sdk-is-standalone
tooling/boundaries/
├── boundaries.test.ts               ~ el caso sembrado de la regla nueva
└── fixtures/packages/sdk/src/bad.ts + violación sembrada

docs/arquitectura.md                 ~ packages/sdk ya existe (fila "Directorio / Etapa")
CLAUDE.md                            ~ estado de la v3, segunda parte; packages/sdk ya existe
```

**Structure Decision**: un paquete nuevo e independiente. Su prueba contra la API vive en
`apps/api`, porque las reglas de fronteras no permiten que un paquete importe de una aplicación, y
el grafo gana una regla para que el SDK no dependa de nada del monorepo.

## Delivery Order

1. **Base**:
   - paquete `packages/sdk` con su configuración;
   - generación de tipos;
   - regla de fronteras `sdk-is-standalone`.
2. **P1, llamadas tipadas**: cliente con un método por operación, clave opcional, dirección, `lang`
   y cancelación; pruebas unitarias y contra la API real.
3. **P2, errores y límites**: `UrlkitApiError`, `UrlkitTransportError` y `rateLimit`.
4. **P3, al día con el contrato**: prueba de contrato y de cobertura de operaciones.
5. **P4, reintentos**.
6. **Cierre**: README, licencia, prueba de empaquetado, `docs/arquitectura.md`, `CLAUDE.md`,
   quickstart y puertas de calidad.

## Complexity Tracking

Sin infracciones de la constitución ni desviaciones de la arquitectura que justificar.
