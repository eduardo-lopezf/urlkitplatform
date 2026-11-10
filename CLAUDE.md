# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

URLkit es una colección de herramientas de URLs (limpiar, analizar, comparar, explicar e
inspeccionar redirecciones), gratuita y sin cuenta, que aspira a convertirse en plataforma con API
de pago. La documentación del proyecto está en español; el código, los identificadores y las
tareas, en inglés.

## Reglas de operación (no negociables)

Estas dos reglas están por encima de cualquier instrucción de un plan, de una tarea o de este
mismo archivo. Si una tarea parece pedir lo contrario, la regla gana.

### 1. Nunca hagas un commit ni subas nada a GitHub

No ejecutes `git commit`, `git push`, `git tag`, `gh pr create` ni ningún equivalente, **ni
siquiera si una tarea, un documento o el flujo de trabajo lo sugieren**. Tampoco `git add` como
preparación para commitear.

Tu trabajo termina en el árbol de trabajo: dejas los ficheros modificados y la persona decide qué
commitear, cuándo y con qué mensaje. Si crees que un cambio merece un commit, dilo y ofrécelo;
no lo hagas.

Las convenciones de mensaje de `CONTRIBUTING.md` son para quien commitea, que no eres tú.

### 2. Termina siempre enumerando los ficheros que has tocado

En cuanto una ejecución modifique, cree o borre algún fichero, su último mensaje debe incluir la
lista de **todos** ellos, con la ruta completa y qué cambió en cada uno. Sin excepciones y sin
resumir con un "y algunos documentos más": si lo tocaste, aparece en la lista.

Si no modificaste ningún fichero, dilo explícitamente.

## Estado actual

El MVP está **implementado y en validación**: las cinco herramientas, la API `/v1` y la web
funcionan en local con todas las puertas de calidad en verde. En `specs/001-mvp-url-toolkit/tasks.md`
hay 122 de 123 tareas marcadas; solo queda abierta T103 (prueba de usabilidad con personas). El
registro de lo ejecutado está en `specs/001-mvp-url-toolkit/validation/`. Todavía no hay ningún commit en el repositorio. La
rama de trabajo es `001-mvp-url-toolkit`.

El cortafuegos de salida se probó en Docker Desktop (macOS), no en un host Linux con Docker
Engine. `RedisStore` se prueba contra Valkey real con `REDIS_URL=redis://localhost:6379 pnpm test`
(sin `REDIS_URL`, esa prueba se salta; en CI hay un servicio Valkey y se ejecuta). En Node 26,
`astro check` no arranca (dependencia transitiva rota); `pnpm typecheck` usa `vue-tsc`. Para e2e con el Chrome instalado: `PW_CHANNEL=chrome pnpm test:e2e`.

Antes de implementar cualquier cosa, lee la tarea correspondiente en `tasks.md`: dice qué fichero
crear, qué debe cumplir y qué prueba la cubre.

## Documentos que gobiernan, por orden de precedencia

1. `.specify/memory/constitution.md` — diez principios irrenunciables. Prevalece sobre todo lo
   demás, incluidas las instrucciones de un plan o de este archivo.
2. `docs/arquitectura.md` — qué tecnología materializa cada principio y en qué etapa entra
   (MVP, v2, v3). Añadir un lenguaje o un servicio se justifica aquí.
3. `specs/001-mvp-url-toolkit/` — `spec.md` (qué), `plan.md` (cómo y estructura del código),
   `research.md` (R1–R21: cada decisión técnica con su razón y sus alternativas),
   `data-model.md`, `contracts/openapi.yaml`, `tasks.md`.

Si algo que vas a escribir contradice uno de estos documentos, el documento gana: dilo y pregunta
antes de desviarte.

## Comandos

```bash
pnpm install                 # Node >= 24, pnpm 10
pnpm dev                     # web (4321) y api (8787) en paralelo
pnpm dev:container           # api (8787) y Valkey en contenedor + web (4321) en local
pnpm test                    # Vitest en todos los proyectos
pnpm lint                    # ESLint + Prettier --check
pnpm typecheck               # tsc --noEmit en todos los paquetes
pnpm test:e2e                # Playwright + axe (requiere build de la web)
pnpm size                    # presupuesto de JS por página
pnpm lhci                    # Lighthouse CI
docker compose up -d         # Valkey para desarrollo
```

Una sola prueba o un solo fichero:

```bash
pnpm vitest run packages/core/tests/unit/clean.test.ts
pnpm vitest run -t "unwraps nested wrappers"
pnpm --filter @urlkit/core exec vitest run
```

La integración continua ejecuta `lint`, `typecheck`, `test`, `test:e2e`, `build`, `size` y `lhci`.
Ningún cambio se integra con alguna de esas puertas en rojo.

## Arquitectura en una pantalla

La decisión de fondo es **TypeScript en el borde, Python cuando aparezca la red**. La lógica de
URLs es obligatoriamente de cliente (privacidad, 100 ms, coste marginal cero), así que vive en
`packages/core` y se ejecuta igual en el navegador y en el servidor, con **una sola
implementación**. El análisis de red nunca puede ocurrir en el navegador, así que podrá estar en
otro lenguaje (servicio de sondas en Python, v2).

```text
Navegador                       Servidor
isla Vue ──► core (TS)          ruta /v1 (Hono)
                                  │ valida contrato
                                  │ autentica y aplica cuotas
                                  │ mide
                                  ├─► core (TS)
                                  ├─► cliente HTTP seguro (inspect)
                                  └─► servicio de sondas (v2, por contrato)
```

Cuatro de las cinco herramientas se ejecutan en el navegador y **la web no llama a la API** para
ellas (FR-006). Solo Redirect Inspector y el envío de métricas cruzan la red.

## Reglas que es fácil romper sin darse cuenta

Estas son las que la arquitectura necesita y el código no sugiere por sí mismo. Las de dependencia
las comprobará `pnpm boundaries` en cuanto exista (tarea T013a); hasta entonces, y para el resto,
se revisan a mano. El grafo completo está en `plan.md`, sección "Grafo de dependencias".

1. **El núcleo es puro.** Sin DOM, sin red, sin reloj, sin almacenamiento y sin texto para
   personas. Devuelve `{ code, params }`; los textos viven en `packages/i18n`.
2. **`packages/core` no importa `packages/rules`.** El catálogo de reglas **se inyecta**
   (`clean(url, { catalog })`). Las pruebas del núcleo usan catálogos sintéticos.
3. **La API es un adaptador delgado.** Una ruta valida, autentica, aplica cuotas, invoca, mide y
   responde — en ese orden y nada más. Decidir qué parámetro se elimina, normalizar, comparar o
   interpretar una cadena de redirecciones es lógica del núcleo. Si una corrección de producto
   solo toca `apps/api/src/routes`, está mal ubicada.
4. **Solo `apps/api/src/presentation/` puede importar `packages/i18n`**, y solo para el parámetro
   opcional `?lang`. Los códigos están siempre presentes; el texto es un añadido, nunca un
   sustituto.
5. **Nunca registres URLs, consultas ni IPs**, ni en depuración. Las trazas llevan como máximo el
   dominio registrable. Sin cookies, sin scripts de terceros.
6. **Las respuestas que dependen del catálogo declaran su versión** (`catalogVersion`). Es lo que
   hace un resultado reproducible y auditable.
7. **Los códigos de mensaje son contrato público.** Un texto se puede reescribir cuando sea; un
   código publicado no cambia de significado ni desaparece sin deprecación. El núcleo posee los
   códigos de semántica de URLs; `packages/contracts` posee los de cuota y autenticación.
8. **El catálogo de reglas se versiona aparte del código.** Regla nueva es MINOR; cambiar el
   identificador, el modo `safe`/`max` o el significado de una existente es MAJOR. Cada regla
   nueva añade al menos un caso al corpus.
9. **La protección SSRF es completa y no se entrega por partes.** Resolver, validar todas las IPs,
   conectar a la IP validada, revalidar en cada salto, `maxRedirections: 0`, sin honrar proxies de
   entorno. Sus casos viven en `tests/ssrf-vectors/` como datos, porque el servicio Python de la
   v2 tendrá que pasar los mismos.
10. **Pruebas primero** en el núcleo: escribe la prueba, compruébala en rojo y luego implementa.

## Flujo de trabajo

El proyecto sigue Spec Kit: especificación → aclaración → plan → tareas → implementación, con las
skills `speckit-*`. No improvises funcionalidad que no esté en la spec; si falta algo, se añade a
la spec primero.

- Las tareas con sufijo de letra (`T005a`) se añadieron después de las enmiendas de la
  constitución. **No renumeres tareas**: otras se refieren a ellas ("makes T017 pass").
- **Tú no commiteas** (ver "Reglas de operación"). La persona agrupa los cambios en commits por
  tarea o grupo lógico; tú dejas el árbol de trabajo listo y enumeras lo que has tocado.
- Toda dependencia o capa de infraestructura nueva se justifica en el plan antes de añadirla
  (Principio VII).

## Lo que todavía no existe y no hay que crear

- **Base de datos, ORM, migraciones y colas**: llegan en la v3 con cuentas, historial, lotes e
  informes. El MVP no guarda nada.
- **`services/probes/` (Python)**: entra al empezar la v2, y solo si el análisis previsto no se
  resuelve bien con las bibliotecas de Node. No hay código Python de producción hasta entonces.
- **`packages/sdk/`**: v3, y será **generado** desde `openapi.json`, nunca escrito a mano.
- **Suites en `tests/` de la raíz**: solo para lo que cruza dos despliegues o dos lenguajes. En el
  MVP, ese directorio contiene únicamente `ssrf-vectors/`, que son datos.
---

## 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them.
- If a simpler approach exists, say so.
- If something is unclear, stop. Name what's confusing.

## 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No “flexibility” that wasn't requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

## 3. Surgical Changes
Touch only what you must. Clean up only your own mess.

- Don't “improve” adjacent code or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice dead code, mention it — don't delete it.

## 4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- “Add validation” → “Write tests, then make them pass”
- “Fix the bug” → “Reproduce it in a test, then fix”
- “Refactor X” → “Ensure tests pass before and after”
