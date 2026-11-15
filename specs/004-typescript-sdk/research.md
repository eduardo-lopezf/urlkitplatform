# Research: Versión 3, segunda parte — SDK de TypeScript

Cada decisión con su razón y sus alternativas. La spec es [spec.md](./spec.md); el plan,
[plan.md](./plan.md).

## R1. Tipos generados con `openapi-typescript`; cliente propio sin dependencias

- **Decisión**: los tipos salen de `packages/contracts/openapi.json` con **`openapi-typescript`**,
  como dependencia de desarrollo, en un fichero generado que se versiona
  (`packages/sdk/src/generated/openapi.ts`). El cliente es código propio, de unas doscientas
  líneas, sobre `fetch` y esos tipos, **sin dependencias en tiempo de ejecución**.
- **Razón**:
  - El Principio IX exige que los tipos del consumidor se generen y no se escriban a mano.
    `openapi-typescript` genera tipos de TypeScript puros (`paths`, `components`, `operations`) y
    nada más: no impone una forma de cliente.
  - Las ayudas que pide la spec (errores por código, límites de uso, reintentos acotados) son
    propias de esta API y cortas. Escribirlas sobre los tipos generados evita una dependencia en
    tiempo de ejecución para quien instale el paquete (spec, "Assumptions").
- **Alternativas**:
  - `openapi-fetch`: buen cliente fino, pero es una dependencia más en tiempo de ejecución, y aun
    así habría que envolverlo para los errores, los límites y los reintentos.
  - Generadores de cliente completo (`openapi-generator`, `orval`, `hey-api`): generan mucho código y
    clases con su propio estilo; cambiar la forma de los errores o los reintentos obliga a plantillas
    propias.
  - Reutilizar los esquemas Zod de `packages/contracts`: añadiría Zod en tiempo de ejecución y ataría
    el SDK publicado a un paquete interno del monorepo.

## R2. Al día con el contrato, comprobado en las pruebas

- **Decisión**: una prueba del SDK regenera los tipos en memoria con la API programática de
  `openapi-typescript` y los compara con el fichero versionado; si difieren, falla con
  "ejecuta `pnpm --filter @urlkit/sdk generate`". Otra prueba lee las operaciones con etiqueta
  `tools` del contrato y exige un método del cliente por cada `operationId` (FR-021, FR-022).
  Además, el cliente declara sus métodos contra la unión de `operationId` generada, así que una
  herramienta nueva sin método ni siquiera compila.
- **Razón**: es el mismo patrón que ya usa `packages/contracts` ("is up to date with the Zod
  schemas"). Corre en `pnpm test`, que CI ya ejecuta, sin pasos nuevos en el flujo de trabajo.
- **Alternativas**: un paso de CI que regenere y haga `git diff --exit-code` (válido, pero un paso
  más en el flujo de trabajo y menos explícito al fallar en local).

## R3. Forma pública del cliente

- **Decisión**: `createClient({ apiKey?, baseUrl?, fetch?, retries? })` devuelve un objeto con un
  método por herramienta, nombrado como su `operationId` (`cleanUrl`, `parseUrl`, `diffUrls`,
  `explainUrl`, `inspectRedirects`, `analyzeHeaders`, `extractMetadata`, `analyzeTls`,
  `lookupDns`, `reviewSecurity`). Cada método recibe el cuerpo tipado y opciones
  (`{ signal?, lang? }`) y devuelve `{ data, rateLimit }`. Superficie completa en
  [contracts/sdk-api.md](./contracts/sdk-api.md).
- **Razón**: los `operationId` ya son estables en el contrato publicado; usarlos como nombres hace
  que la correspondencia con la documentación de la API sea directa y que la prueba de cobertura
  sea trivial. Devolver `rateLimit` junto a `data` cumple FR-012 sin una segunda llamada.
- **`fetch` inyectable**: permite usar el SDK con la implementación de `fetch` que prefiera la
  integración, y probarlo en proceso contra la API real (`app.request`, R6).
- **Dirección por defecto**: la de producción que declara el contrato (`servers[0].url`), copiada
  al generar. Es provisional hasta el despliegue (001/T111–T114).
- **Alternativas**: métodos con nombres propios (`client.clean`) que habría que mantener a mano;
  devolver solo `data` y exponer los límites con un evento (más complejo para lo mismo).

## R4. Errores

- **Decisión**: dos clases exportadas.
  - `UrlkitApiError`: respuesta de error de la API. Tiene `code` (el código del contrato, con tipo
    de la unión generada `MessageCode`, abierto a códigos futuros), `status`, `retryAfterSeconds`
    (en `quota.exceeded` y `auth.unavailable`) y `rateLimit`.
  - `UrlkitTransportError`: fallo de red, tiempo agotado, cancelación o respuesta que no es del
    contrato. Tiene `kind`: `'network' | 'timeout' | 'aborted' | 'invalid-response'`, y el `status`
    si hubo respuesta.
  - El mensaje de ambas es el código o el tipo de fallo; nunca incluye cabeceras ni la clave
    (FR-014). Ninguna guarda la petición original.
- **Razón**: la integración decide por `instanceof` y por `code`, que es contrato estable
  (Principio X, reglas de `CLAUDE.md`). Separar los fallos de transporte evita confundir un proxy
  caído con un `auth.invalid` (FR-013).
- **Código desconocido**: se conserva tal cual en `code` (spec, "Edge Cases"); el tipo es
  `MessageCode | (string & {})` para no romper con códigos nuevos.

## R5. Reintentos

- **Decisión**: `retries` desactivado por defecto. Con `retries: { maxAttempts?, maxWaitSeconds? }`
  (por defecto 3 intentos en total y 60 s de espera máxima), el cliente reintenta **solo** ante
  `429` y `503`, espera `Retry-After` (o 1 s si falta), y devuelve el error sin esperar si la espera
  supera `maxWaitSeconds`. Nunca reintenta `401`, otros `4xx`, errores de transporte ni llamadas
  canceladas; la espera se interrumpe si se cancela la llamada.
- **Razón**: FR-030–FR-033. Tres intentos y un minuto son conservadores: no esconden un problema de
  cuota durante horas, y la cuota de una hora no se recupera esperando segundos (con `429` de una
  ventana horaria, `Retry-After` suele superar el máximo y el error llega enseguida).
- **Alternativas**: espera exponencial propia (ignoraría lo que dice la API); reintentar errores de
  red (un `POST` a una herramienta de red ya consumió cuota; repetirlo sin saber si llegó no es
  seguro por defecto).

## R6. Pruebas

- **Decisión**:
  - **Unitarias** en `packages/sdk/tests/` con un `fetch` simulado: cabecera `Authorization` con y
    sin clave, dirección base, `lang`, lectura de `RateLimit-*`, errores de la API y de transporte,
    reintentos (intentos exactos, `Retry-After`, `401` sin reintento, cancelación), y que la clave no
    aparece en ningún error ni en su texto (SC-005, SC-006).
  - **Contra la API real**, en `apps/api/tests/sdk/`: el SDK con `fetch` = `app.request` de la
    aplicación Hono de pruebas, una llamada por herramienta, con clave (`MemoryKeyStore`) y sin ella,
    y los errores reales (`401`, `429`, `503`) (FR-023). Va en `apps/api` porque
    `.dependency-cruiser.cjs` prohíbe que un paquete importe de una aplicación; una aplicación sí
    puede usar un paquete, y `apps/api` gana `@urlkit/sdk` como dependencia de desarrollo.
  - **Contrato al día y cobertura**, en `packages/sdk/tests/` (R2).
  - **Paquete instalable** (SC-007): una prueba empaqueta el SDK con `pnpm pack`, lo instala en un
    directorio vacío fuera del monorepo y ejecuta un script que crea un cliente y hace una llamada
    contra un servidor HTTP mínimo de la prueba. Se salta fuera de CI si no hay red para `npm`, con el
    mismo `skipUnless` de la 003.
  - **Cero peticiones adicionales** (SC-004): el `fetch` simulado cuenta las llamadas.
- **Alternativas**: arrancar la API como proceso aparte para las pruebas (más lento y frágil; el
  `app.request` en proceso usa el mismo código de rutas).

## R7. Compilación y distribución

- **Decisión**:
  - **En el monorepo**, `package.json` exporta `./src/index.ts`, como el resto de paquetes (Node
    ejecuta TypeScript directamente). Así `apps/api` lo prueba sin compilar.
  - **Para publicar**, `publishConfig` sustituye las exportaciones por `./dist/index.js` y
    `./dist/index.d.ts`, y `prepack` compila con `tsc -p tsconfig.build.json` (ESM, declaraciones,
    `rewriteRelativeImportExtensions` para que las importaciones `.ts` salgan como `.js`). Publicar
    es `pnpm --filter @urlkit/sdk publish --access public` (FR-040), que no se ejecuta en esta
    feature (FR-041).
  - Ficheros publicados: `dist/`, `README.md`, `LICENSE`. Versión inicial `0.1.0`; el `README` y una
    constante exportada declaran la versión del contrato con la que se generó (FR-042).
- **Razón**: un único `package.json`, sin compilar para desarrollar, y un paquete publicado que
  funciona sin TypeScript en el proyecto de quien lo instala.
- **Licencia**: el plan prevé la del proyecto, `FSL-1.1-ALv2`, como pide la spec. **Antes de
  publicar conviene decidirlo**: una licencia de uso restringido en una biblioteca cliente puede
  frenar a quien integra, y es habitual que los SDK vayan con una licencia permisiva (MIT o
  Apache-2.0) aunque el servicio no. No bloquea esta feature, porque no se publica.
- **Alternativas**: dos paquetes (fuente y compilado); compilar también en desarrollo (un paso más
  antes de cada prueba).

## R8. El SDK es independiente del monorepo

- **Decisión**: una regla nueva en `.dependency-cruiser.cjs`, `sdk-is-standalone`: el código de
  `packages/sdk/src` solo importa sus propios ficheros y módulos de Node; nunca otro paquete del
  monorepo. Con su caso de violación sembrado en `tooling/boundaries/fixtures`, como el resto.
- **Razón**: el paquete se publicará solo (SC-007); una importación de `@urlkit/core` o
  `@urlkit/contracts` funcionaría en el monorepo y rompería al instalarlo fuera. La comprobación de
  fronteras lo detecta antes que la prueba de empaquetado.
- **Alternativas**: confiar en la prueba de empaquetado (detecta el problema, pero tarde y sin decir
  qué importación es la culpable).
