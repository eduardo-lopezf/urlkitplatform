# Cómo contribuir

Este proyecto se desarrolla con un flujo de especificación previa. Antes de escribir código, el
cambio tiene que existir en la especificación y en las tareas.

## Flujo

```text
especificación → aclaración → plan → tareas → implementación
```

Se gestiona con las skills `speckit-*` (ver `.specify/`). En la práctica:

1. Si la funcionalidad no está en `specs/001-mvp-url-toolkit/spec.md`, se añade allí primero.
2. El plan (`plan.md`) decide la tecnología y la estructura, y justifica cada dependencia nueva.
3. Las decisiones técnicas se registran en `research.md` con su razón **y sus alternativas
   descartadas**. Una decisión sin alternativas documentadas no está tomada, está asumida.
4. `tasks.md` es la lista de trabajo. Cada tarea indica el fichero exacto y la prueba que la cubre.

**No renumeres tareas.** Las tareas añadidas después de las enmiendas de la constitución llevan
sufijo de letra (`T005a`) precisamente para no romper las referencias cruzadas del tipo
"makes T017 pass".

## Antes de abrir un cambio

Lee los dos documentos que prevalecen sobre cualquier criterio propio:

- `.specify/memory/constitution.md` — los diez principios del proyecto.
- `docs/arquitectura.md` — qué tecnología entra, en qué etapa y con qué frontera.

Si tu cambio contradice alguno, no lo implementes a medias: propón la enmienda. La constitución se
modifica con informe de impacto y versionado semántico, y eso es un camino legítimo.

## Puertas de calidad

La integración continua ejecuta, y ninguna puede quedar en rojo:

```bash
pnpm lint          # ESLint + Prettier
pnpm typecheck     # tsc --noEmit
pnpm test          # Vitest (núcleo, reglas, contratos, API)
pnpm test:e2e      # Playwright + axe (accesibilidad AA)
pnpm size          # JS inicial < 150 KB comprimido por página
pnpm lhci          # Lighthouse: carga < 1 s en 4G simulado
pnpm boundaries    # fronteras de dependencia entre paquetes (llega con T013a)
```

Mientras el comprobador de fronteras no exista, sus invariantes se revisan a mano; están
enumeradas en `plan.md`, sección "Grafo de dependencias".

Las pruebas del núcleo se escriben **primero**: se comprueba que fallan y después se implementa
(Principio VI).

## Qué se revisa en cada cambio

Más allá de que funcione:

- **El adaptador no ha ganado lógica.** Una ruta de `/v1` valida, autentica, aplica cuotas,
  invoca, mide y responde. Nada más (Principio VIII).
- **Las fronteras se respetan.** `pnpm boundaries` las comprueba, pero conviene entenderlas:
  el núcleo no importa el catálogo de reglas, solo `apps/api/src/presentation/` importa los textos,
  y `packages/ui` no conoce el dominio.
- **Compatibilidad de códigos y reglas.** Un código de mensaje publicado no cambia de significado
  ni desaparece sin deprecación; una regla que cambia de identificador o de modo es un cambio
  mayor del catálogo (Principio X).
- **Ninguna URL en los registros.** Tampoco en depuración, tampoco en trazas, tampoco en el
  servicio de errores.
- **Accesibilidad**: WCAG 2.2 AA, teclado, desde 320 px, claro y oscuro.

## Reglas de limpieza

Cada regla nueva en `packages/rules/data/`:

- Lleva identificador estable, motivo y plataforma.
- Añade **al menos un caso** al corpus de URLs reales.
- Añadir reglas sube la versión MINOR del catálogo; cambiar o eliminar una existente, MAJOR.

Las listas públicas (ClearURLs, AdGuard) sirven como referencia de contraste. Importar datos de
ellas requiere revisar su licencia antes.

## Peticiones salientes

Cualquier código que haga una petición a Internet pasa por la validación SSRF completa descrita en
`docs/arquitectura.md`, sección 9, y se demuestra contra los vectores de `tests/ssrf-vectors/`.
Esto incluye lenguajes futuros: los vectores son datos, no una suite de TypeScript.

Si encuentras un caso que la validación no cubre, **añade el vector primero**; protege a todos los
lenguajes a la vez.

## Licencia de las contribuciones

El proyecto se publica bajo `FSL-1.1-ALv2` ([`LICENSE.md`](LICENSE.md)). Antes de aceptar
contribuciones externas se pedirá un acuerdo de contribución (CLA) que permita al titular
ofrecerlas también bajo otras condiciones, por ejemplo a clientes de la API de pago. Hasta que ese
acuerdo exista, no se integran contribuciones de terceros.

## Commits

Un commit por tarea o grupo lógico, con el identificador de la tarea en el mensaje:

```text
T050 clean: implement safe mode with injected catalog
```

Los agentes de código **no commitean**: dejan los cambios en el árbol de trabajo y enumeran los
ficheros tocados, y es la persona quien revisa y crea el commit (ver `CLAUDE.md`).
