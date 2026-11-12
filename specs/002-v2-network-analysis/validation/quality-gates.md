# Validación: puertas de calidad (002/T097)

**Fecha**: 2026-11-12 · **Máquina**: macOS (Darwin 24.6), Node 26.5.0, pnpm 10.34.9 · **Catálogo**:
1.3.0

Todas las puertas de la integración continua, ejecutadas en local sobre el árbol de trabajo con la
v2 completa (T001–T096).

| Puerta | Comando | Resultado |
| --- | --- | --- |
| Lint | `pnpm lint` | 0 errores. 2 avisos previos a la v2 en `apps/web/src/islands/DiffIsland.vue` (orden de atributos), no tocados |
| Formato | `prettier --check .` (dentro de `pnpm lint`) | Todo con formato |
| Tipos | `pnpm typecheck` | Sin errores en los 7 paquetes |
| Fronteras | `pnpm boundaries` | Sin infracciones (142 módulos, 464 dependencias) |
| Pruebas | `REDIS_URL=redis://localhost:6379 pnpm test` | 54 ficheros, 1740 pruebas, incluida la suite contra Valkey real (repetido tras las correcciones de T098 y del inspector) |
| Build | `pnpm build` | 27 páginas |
| Presupuesto de JS | `pnpm size` | 143,45 KB de 150 KB (comprimido, todas las páginas juntas) |
| E2E y accesibilidad | `PW_CHANNEL=chrome pnpm test:e2e` | 116 pruebas (escritorio y 320 px), axe AA sin infracciones |
| Lighthouse | `pnpm lhci` | 11 páginas, todas las aserciones cumplidas (FCP < 1 s, accesibilidad ≥ 0,95, peso < 300 KB) |

Comprobaciones específicas de la v2:

- `parse5` y `dns-packet` no aparecen en ningún fichero de `apps/web/dist/_astro`: el analizador
  HTML se inyecta desde `@urlkit/core/html` y el cliente DoH solo vive en la API.
- La suite SSRF ejecuta los vectores compartidos contra `safeFetch` y contra el conector TLS, y
  falla si un módulo de `apps/api/src/probes/` abre conexiones sin estar en su lista.

Observaciones:

- **Margen del presupuesto de JS**: quedan 6,7 KB. La siguiente herramienta con isla propia
  puede agotarlo; conviene revisar antes qué comparten las islas de la v2.
- `pnpm size` se quedó colgado dos veces tras imprimir el tamaño (al medir el tiempo de ejecución
  en Chrome sin ventana). Al repetirlo terminó. El tamaño, que es lo que se comprueba, sale antes.
