# Validación: puertas de calidad (004/T022)

**Fecha**: 2026-11-14 · **Node**: v26.5.0

| Puerta | Resultado |
| --- | --- |
| `pnpm lint` | ✅ (el fichero generado del SDK queda fuera de ESLint y Prettier: se compara literalmente con la salida del generador) |
| `pnpm typecheck` | ✅, también `packages/sdk` |
| `pnpm boundaries` | ✅ con la regla nueva `sdk-is-standalone` y su caso sembrado |
| `pnpm test` | ✅ 73 ficheros, 1832 pruebas, con `CI=true` y los servicios de la 003 (ninguna saltada). Del SDK: 25 en `packages/sdk/tests` (cliente, errores, reintentos, contrato, empaquetado) y 2 en `apps/api/tests/sdk` contra la API real |
| `pnpm test:e2e` | ✅ 120 (con `PW_CHANNEL=chrome`) |
| `pnpm build` | ✅ (compila también `packages/sdk` a `dist/`) |
| `pnpm size` | ✅ 143,84 KB, igual que antes: el SDK no toca la web |
| `pnpm lhci` | ✅ |

## Comprobaciones que demuestran que las pruebas muerden

- **Contrato al día (T004)**: cambiar a mano un `summary` de `packages/contracts/openapi.json` sin
  regenerar hace fallar `contract.test.ts` con "run `pnpm --filter @urlkit/sdk generate`" (contrato
  restaurado después).
- **Cobertura (T015)**: una operación `tools` falsa añadida al contrato aparece como ausente.
- **Privacidad de la clave (T010)**: un error que arrastrara la causa original de `fetch` haría
  fallar la prueba; se probó y se restauró el código.

## Fallos encontrados al validar

- **`README.md` del SDK sin escribir**: se creaba en una orden encadenada detrás de un `cp LICENSE`
  que falló (el fichero del proyecto es `LICENSE.md`). La prueba de empaquetado lo detectó porque el
  paquete instalado no lo llevaba. Escrito y comprobado.
- **Prueba de empaquetado colgada**: el script de comprobación se lanzaba de forma síncrona y
  bloqueaba el servidor HTTP del propio proceso de la prueba. Ahora se lanza de forma asíncrona.
