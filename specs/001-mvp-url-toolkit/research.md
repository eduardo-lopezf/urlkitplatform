# Research: MVP de URLkit

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-06

Cada decisión resuelve un punto abierto del contexto técnico. Formato: Decisión / Razón /
Alternativas consideradas.

## R1. Lenguaje y organización del código

- **Decisión**: TypeScript en modo estricto en todo el proyecto, en un monorepo con pnpm
  workspaces. El núcleo de herramientas (`packages/core`) es TypeScript puro sin dependencias de
  DOM, red ni almacenamiento, y se ejecuta igual en el navegador y en el servidor.
- **Razón**: FR-006 exige que cuatro herramientas funcionen en el navegador y la constitución
  (Principio IV) exige exponerlas también por API. Un único núcleo compartido evita dos
  implementaciones que puedan divergir (Principio II).
- **Alternativas**: Rust compilado a WebAssembly (más rendimiento, pero más complejidad y peso
  inicial, innecesario para cadenas cortas); Python en servidor (obligaría a duplicar la lógica en
  JavaScript para el navegador).
- **Nota de arquitectura**: el lenguaje se elige por frontera, no por capa. El núcleo de URLs debe
  ejecutarse en navegador y servidor, así que es TypeScript con una sola implementación; el
  análisis de red de la versión 2, que nunca puede ejecutarse en el navegador, podrá estar en otro
  lenguaje. Ver [`docs/arquitectura.md`](../../docs/arquitectura.md), secciones 1 y 11.

## R2. Análisis de URLs según el estándar

- **Decisión**: usar la clase `URL` nativa (WHATWG) de navegadores y Node como analizador de
  referencia; `tldts` (Public Suffix List) para el dominio registrable y el subdominio; `punycode`
  para mostrar hosts en Unicode. La detección de homógrafos usa las propiedades de script Unicode
  de las expresiones regulares nativas (`\p{Script=...}`).
- **Razón**: la `URL` nativa ya implementa el WHATWG URL Standard y no añade peso al bundle.
  Validamos su comportamiento con los vectores oficiales de Web Platform Tests (`urltestdata.json`,
  licencia BSD-3) para cumplir SC-006.
- **Alternativas**: `whatwg-url` como dependencia de ejecución (~40 KB, duplica lo nativo; se usa
  solo en pruebas para comparar); analizador propio (riesgo alto de errores en casos límite).
- **Notas**: el analizador nativo normaliza al analizar; para mostrar "forma original" frente a
  "normalizada" (FR-022), el núcleo conserva la cadena de entrada y extrae la query sin normalizar
  para preservar el orden, los repetidos y las codificaciones originales.
- **Divergencias conocidas de la plataforma** (implementación, 2026-11-06): con Node 26 (Ada), 7 de
  los 896 vectores WPT no coinciden con el estándar vigente; todos son hosts con etiquetas Punycode
  inválidas (`xn--`, `a.b.c.xn--pokxncvks`…) que el estándar acepta y Ada rechaza. `parseUrl`
  devuelve un `url.invalid` explícito, nunca un resultado incorrecto, y la prueba las enumera para
  fallar en cuanto la plataforma las corrija. Afecta a SC-006 en ese subconjunto.

## R3. Catálogo de reglas de limpieza

- **Decisión**: catálogo propio en `packages/rules` (archivos JSON validados por esquema), con
  tres tipos de regla: parámetro/patrón de seguimiento, envoltorio de redirección y regla por
  dominio. Cada regla indica modo (`safe` | `max`), plataforma y motivo. En la compilación se
  genera un módulo optimizado (prefijos, conjuntos y expresiones precompiladas).
- **Razón**: control total sobre la calidad y los falsos positivos (p. ej., `ref`), el modo seguro
  frente al de limpieza máxima (aclaración 1) y la explicación de cada eliminación (FR-014).
- **Alternativas**: importar ClearURLs (LGPL-3.0) o los filtros de seguimiento de AdGuard
  (GPL-3.0); son buenas fuentes de referencia, pero sus licencias y su formato obligan a revisar
  cada regla. Se usarán como referencia de contraste; cualquier importación de datos requiere
  revisión de licencia previa.
- **Mantenimiento**: el conjunto de prueba de SC-002 (≥ 200 URLs reales) vive junto al catálogo y
  cada regla nueva debe añadir al menos un caso.

## R4. Aplicación web

- **Decisión**: Astro con generación estática (una página por herramienta e idioma) e islas
  interactivas en **Vue 3** (Composition API y `ref`/`computed` para el estado local de cada
  herramienta), mediante la integración oficial `@astrojs/vue`. Estilos con CSS nativo y tokens de
  diseño (variables CSS) en `packages/ui`; sin framework de CSS.
- **Razón**: el presupuesto de la constitución (JS inicial < 150 KB, carga < 1 s en 4G) favorece
  HTML estático con poco JavaScript. Las páginas estáticas se sirven desde CDN y escalan sin coste.
  Astro trae enrutado por idioma (`/es/`, `/en/`), lo que cumple FR-007.
- **Razón de Vue frente a Preact**: cada herramienta es una isla independiente, así que el
  framework de componentes solo afecta al peso de la isla, no al de la página. Vue 3 es la
  preferencia del proyecto, tiene integración oficial en Astro y su reactividad cubre sin esfuerzo
  el patrón de todas las herramientas (entrada que recalcula un resultado derivado). El coste
  frente a Preact es unas decenas de KB por isla, dentro del presupuesto porque la página
  estática no envía JavaScript fuera de ella.
- **Alternativas**: Nuxt 3 en modo estático (framework de aplicación para lo que son páginas
  independientes sin estado compartido; hidrata y añade payload donde no hay interacción, y
  consumiría el presupuesto de 150 KB por página); Preact con signals (más ligero, pero no es el
  lenguaje de componentes elegido para el proyecto); Next.js/React (más JS en cliente y servidor
  necesario); SvelteKit (válido, similar peso, ecosistema de islas menos directo); SPA pura (peor
  SEO y primera carga).
- **Consecuencia**: `packages/ui` publica componentes Vue y los tokens CSS; `size-limit` vigila el
  presupuesto por página, no por paquete.
- **Notas de implementación** (2026-11-06): las islas son componentes `.vue` (las rutas de
  `tasks.md` con `.tsx` venían de la versión con Preact). La web resuelve `tldts` a su build
  preminificado: empaquetar sus fuentes ES producía 114 KB comprimidos frente a 49 KB. La CSP se
  genera con `security.csp` de Astro (hashes, sin `unsafe-inline`). `astro check` no arranca en
  Node 26 por una dependencia transitiva (`@emnapi/runtime` beta); `pnpm typecheck` usa `vue-tsc` y
  `astro check` queda como `pnpm --filter @urlkit/web check:astro`.

## R5. API y Redirect Inspector

- **Decisión**: servicio HTTP en Node.js (LTS actual) con Hono y `@hono/zod-openapi`, empaquetado
  como contenedor OCI sin estado. El contrato OpenAPI se genera desde los esquemas Zod y se
  publica en `/v1/openapi.json`.
- **Razón**: Redirect Inspector necesita control fino de la conexión para la protección SSRF
  (R6), algo que los entornos edge no permiten. Hono es ligero, tipado y genera OpenAPI desde los
  mismos esquemas de validación, cumpliendo el Principio IV sin trabajo duplicado.
- **Alternativas**: funciones edge (Cloudflare Workers): no permiten validar la IP resuelta antes
  de conectar; Fastify o Express: válidos pero con más configuración para OpenAPI.

## R6. Protección SSRF en Redirect Inspector

- **Decisión**: peticiones con `undici` usando un `lookup` personalizado que resuelve el nombre,
  valida **todas** las IPs resueltas y fija la conexión a la IP validada (evita DNS rebinding).
  Se bloquean: IPv4 privadas, loopback, link-local (incluido 169.254.169.254), CGNAT, multicast,
  reservadas y no especificadas; IPv6 equivalentes (`::1`, `fc00::/7`, `fe80::/10`, IPv4 mapeadas).
  Se rechazan esquemas distintos de `http`/`https`, credenciales en la URL y puertos fuera de una
  lista permitida (80, 443, 8080, 8443). La validación se repite en cada salto.
- **Límites**: 20 saltos (FR-031), 5 s por salto y 15 s en total, lectura máxima de 256 KB de
  cuerpo solo en respuestas HTML (para detectar `meta refresh` y redirecciones en JavaScript sin
  ejecutarlas), sin cookies, sin seguir recursos, `User-Agent` identificable del servicio.
- **Método**: `GET` (muchos servidores responden mal a `HEAD`), descartando el cuerpo salvo el
  fragmento HTML necesario.
- **Errores de TLS**: el salto se marca con el error y la inspección se detiene ahí. Si el servidor
  corta la negociación TLS (`ECONNRESET`) antes de responder, la petición se repite una vez, a la
  misma IP fijada y dentro del mismo límite del salto, ofreciendo solo grupos clásicos
  (`X25519:P-256:P-384`). Node (OpenSSL 3.5 y posteriores) ofrece por defecto una clave híbrida
  poscuántica, como los navegadores actuales, y algunos servidores cortan ese `ClientHello` más
  grande. No se recibió nada, así que repetir el `GET` no cambia nada en el destino (añadido al
  validar la 002, 2026-11-12; la sonda TLS hace lo mismo, 002 research R5).
- **Alcance**: la protección es **completa en el MVP**; no se entrega por partes ni se aplaza a la
  versión 2 (Principio V). Una validación incompleta no reduce el riesgo, lo oculta: sin fijación
  de IP, la comprobación de rangos se sortea con DNS rebinding.
- **Dos detalles que se hacen explícitos**: `undici` se configura con `maxRedirections: 0` —las
  redirecciones las sigue el servicio salto a salto para poder revalidar cada una— y no se honran
  las variables de entorno de proxy, porque un proxy rompería la fijación de IP.
- **Egress de red**: segunda barrera, no sustituto. El contenedor sale por una red que bloquea los
  rangos internos, de modo que un fallo del código no baste para alcanzarlos.
- **Vectores compartidos**: los casos viven en `tests/ssrf-vectors/` como datos independientes del
  lenguaje (entrada y veredicto esperado), no dentro de la suite. En el MVP los ejecuta la suite de
  TypeScript; el servicio de sondas de la versión 2 ejecutará los mismos (ver R21).
- **Alternativas**: listas de bloqueo por nombre de host (insuficientes ante DNS rebinding);
  proxy de salida dedicado (más seguro aún, se reserva para la versión 2, cuando haya más
  herramientas que hagan peticiones salientes).

## R7. Límites de uso e identificación anónima

- **Decisión**: ventanas fijas por hora y por día (10 y 50, FR-034) guardadas en Redis/Valkey con
  caducidad automática igual a la ventana. La clave del visitante es
  `HMAC-SHA256(IP, clave_del_día)`, donde la clave del día se deriva de un secreto del servidor y
  la fecha UTC; nunca se guarda la IP ni la URL (FR-036). Para IPv6 se usa el prefijo /64.
- **Razón**: cumple la aclaración 4 sin cookies, funciona con varias instancias sin estado y los
  datos desaparecen solos al vencer la ventana.
- **Diseño para SaaS**: el limitador recibe un `Subject` (`anon-ip` en el MVP; `api-key` y `user`
  en la versión 3) y un `Plan` (`anonymous` en el MVP) con sus límites por herramienta. La lógica
  de planes vive en `apps/api/src/quota`, separada del núcleo (Principio IV).
- **Alternativas**: ventana deslizante (más precisa, más coste y complejidad, innecesaria con
  estos límites); memoria local (no funciona con varias instancias; solo en desarrollo).

## R8. Medición anónima

- **Decisión**: contadores agregados en el servidor, sin etiquetas que identifiquen visitantes:
  `tool_runs_total{tool,outcome}`, `inspect_duration_seconds` (histograma), `errors_total{tool,code}`.
  La web envía un evento mínimo `{tool, outcome}` a `POST /v1/metrics/events` con `sendBeacon`,
  sin cookies ni identificadores. Los logs estructurados del servidor excluyen URLs, consultas e IPs.
- **Razón**: aclaración 5; no requiere banner de consentimiento y permite saber qué herramientas
  se usan y cuáles fallan.
- **Alternativas**: analítica sin cookies de terceros (descartada en la aclaración 5).
- **Nota de implementación**: el evento se envía con `fetch` y `keepalive`, no con
  `navigator.sendBeacon`, porque `sendBeacon` no permite `application/json` entre orígenes y el
  contrato declara ese tipo. El efecto es el mismo: sobrevive a la navegación y se ignora la respuesta.
- **Observabilidad de operación** (distinta de la medición de producto): trazas con OpenTelemetry
  que registran como máximo el dominio registrable —nunca ruta, consulta ni fragmento—, métricas
  en formato Prometheus y errores con depuración de datos activa, verificada por una prueba que
  comprueba que ningún campo de la entrada llega al servicio de errores. Sin esto, un fallo del
  inspector no es diagnosticable sin violar el Principio V.

## R9. Enlaces compartibles

- **Decisión**: la entrada viaja en el fragmento de la dirección (`/es/clean#u=<url codificada>`;
  URL Diff usa `#a=...&b=...`). El fragmento no se envía al servidor, así que el enlace no deja
  rastro en los logs (FR-005). Antes de copiar se avisa de que quien lo reciba verá la URL.
- **Alternativas**: parámetro de consulta (llega al servidor y a los logs del CDN); enlaces cortos
  almacenados (requieren guardar URLs, contrario a FR-005).

## R10. Internacionalización

- **Decisión**: el núcleo devuelve códigos de mensaje con parámetros (p. ej.,
  `explain.signal.userinfo-deception`), nunca texto. `packages/i18n` contiene los textos en
  español e inglés y una prueba exige que ambos idiomas tengan las mismas claves.
- **Razón**: Explain URL debe ser determinista y bilingüe (FR-053); separar códigos y textos
  mantiene el núcleo puro y facilita añadir idiomas.

## R11. Pruebas y puertas de calidad

- **Decisión**:
  - Vitest para el núcleo y la API (pruebas primero, Principio VI), incluidos los vectores WPT,
    el conjunto de URLs reales de SC-002 y vectores de casos límite.
  - Pruebas de contrato: validar las respuestas de la API contra el OpenAPI publicado.
  - Pruebas SSRF: servidor DNS falso y destinos internos simulados (SC-005).
  - Playwright para extremo a extremo y `@axe-core/playwright` para accesibilidad AA (SC-008),
    con vistas a 320 px y navegación con teclado.
  - `size-limit` para el presupuesto de JavaScript y Lighthouse CI para la carga inicial.
  - ESLint, Prettier y `tsc --noEmit` en la integración continua.
- **Razón**: son las puertas de calidad de la constitución.

## R12. Despliegue y disponibilidad

- **Decisión** (enmendada el 2026-11-10): la web estática se despliega en cualquier CDN; la API,
  en el MVP, en **un VPS autogestionado con Docker Compose** (perfil `selfhosted`: Caddy, API,
  Valkey y `egress-guard`). Cuando el tráfico lo pida, pasa a un proveedor de contenedores con
  autoescalado horizontal y Valkey gestionado; la API no guarda estado, así que el cambio no toca
  el código. Objetivo de disponibilidad del MVP: 99,5 % mensual para la web y la API. Si la API
  cae, las cuatro herramientas locales siguen funcionando porque no dependen de ella.
- **Razón de la enmienda**: en un VPS con Docker Engine el cortafuegos de salida ya probado se
  aplica tal cual, mientras que muchos proveedores gestionados no filtran la salida por rangos. El
  coste es de unos 5–10 € al mes frente a 30–50 € o más. A cambio no hay redundancia: un fallo del
  nodo deja sin Redirect Inspector hasta que vuelve, y perder Valkey solo reinicia los contadores
  de cuota.
- **Razón**: separar el contenido estático del único servicio con estado externo reduce coste y
  riesgo. El proveedor concreto se elige al desplegar; el plan no depende de él.
- **Nota**: la web no se sirve desde Docker Compose. Es lo que hace que las herramientas locales
  tengan coste marginal cero, y por tanto va a CDN. Compose es para desarrollo y, si se
  autogestiona el despliegue, Caddy termina TLS; con un proveedor gestionado esa pieza no existe.

## R13. La API como adaptador delgado

- **Decisión**: los manejadores de `/v1` tienen una única forma, en este orden: validar el
  contrato, resolver identidad, aplicar cuotas, invocar el núcleo o un servicio, medir y
  responder. Ninguna regla de producto vive en `apps/api/src/routes`.
- **Razón**: Principio VIII de la constitución. La API es la superficie que más cambia (versiones,
  claves, planes, cuotas) y la más costosa de probar; todo lo que se acumule en ella queda fuera
  del alcance de las pruebas del núcleo y no se puede reutilizar desde el navegador, donde se
  ejecutan cuatro de las cinco herramientas.
- **Qué queda explícitamente fuera de la API**: decidir qué parámetro se elimina y con qué motivo;
  normalizar, reconstruir o comparar URLs; interpretar una cadena de redirecciones (bucle, límite
  de saltos, destino final, que son lógica pura de `packages/core/src/tools/inspect`); generar
  texto para personas.
- **Qué sí es responsabilidad de la API**: validación de contrato, autenticación, cuotas y
  límites, serialización, traducción de códigos del núcleo a códigos de estado HTTP, cabeceras de
  cuota y medición.
- **Cómo se detecta la desviación**: una ruta que no se puede leer en esos seis pasos, un
  comportamiento que solo se puede probar arrancando el servidor, o una corrección de producto que
  solo toca ficheros de rutas. La revisión de código lo comprueba en cada cambio.
- **Alternativas**: concentrar la lógica del inspector en la API por comodidad, ya que es la única
  herramienta que necesita red (descartada: el modelo de saltos y su interpretación son
  deterministas y deben ser probables sin servidor, y el navegador debe poder presentar el
  resultado con la misma lógica).

## R14. Contratos entre servicios

- **Decisión**: cada frontera entre procesos tiene contrato declarado, versionado y legible por
  máquina, y los tipos del consumidor se generan desde él. Las fronteras del producto y su
  contrato están tabuladas en [`docs/arquitectura.md`](../../docs/arquitectura.md), sección 5.
  En el MVP son: navegador ↔ `/v1` (OpenAPI generado desde Zod), cliente externo ↔ `/v1` (el mismo
  OpenAPI, publicado), núcleo ↔ catálogo de reglas (JSON Schema) y API ↔ Valkey (convención de
  claves con prefijo versionado). Las fronteras internas del monorepo, que no cruzan proceso pero
  sostienen los mismos principios, están en la sección 6 del mismo documento y se verifican en CI
  (ver R17 y R18).
- **Razón**: Principio IX. El sistema llegará a hablar TypeScript, Python y SQL; en un sistema de
  un solo lenguaje el compilador detecta una frontera rota, en uno políglota no la detecta nadie
  hasta producción.
- **Obligaciones**: pruebas de contrato a ambos lados (el proveedor demuestra que sus respuestas
  cumplen el esquema; el consumidor, que funciona contra él); ningún servicio accede al
  almacenamiento de otro; cada contrato declara sus modos de fallo (códigos de error, tiempo de
  espera y comportamiento esperado del consumidor cuando el proveedor no responde); los cambios
  incompatibles se publican como versión mayor con deprecación anunciada.
- **En el MVP**: no hay frontera entre procesos propios todavía —la API importa el núcleo
  directamente—, pero el contrato `/v1` ya se trata como público y con pruebas en ambos lados,
  porque es el que heredará la versión 3 con claves y planes.
- **Alternativas**: tipos compartidos escritos a mano en cada lenguaje (descartada: dos
  definiciones de la misma cosa divergen); acceso directo del cliente a la base de datos de otro
  servicio (descartada por el Principio IX).

## R15. Versionado del catálogo de reglas y estabilidad de los códigos

- **Decisión**: el catálogo de reglas se versiona con versionado semántico propio, independiente
  del código: PATCH para motivos y metadatos, MINOR para reglas nuevas, MAJOR para cambiar el
  significado, el identificador o el modo (`safe`/`max`) de una regla existente o para eliminarla.
  Cada regla tiene identificador estable que no se reutiliza. Toda respuesta que dependa del
  catálogo indica la versión aplicada.
- **Razón**: Principio X. Las reglas son la parte del producto que cambia a diario; sin disciplina
  de compatibilidad, una actualización puede alterar en silencio el resultado que un cliente ya
  integró. Declarar la versión aplicada hace el resultado reproducible y auditable.
- **Códigos de mensaje**: son parte del contrato público, porque los clientes de la API ramifican
  su código a partir de ellos. Un texto puede corregirse en cualquier momento sin cambio de
  versión; un código publicado no cambia de significado ni desaparece sin deprecación anunciada.
  Si el significado cambia, se publica un código nuevo y el anterior se marca obsoleto. La
  estructura es `<herramienta>.<categoría>.<caso>` y se documenta en el OpenAPI con el mismo
  identificador que usa el núcleo, sin traducción intermedia que pueda divergir.
- **Verificación en CI**: esquema del catálogo validado; cada regla nueva aporta al menos un caso
  al corpus de SC-002; paridad de claves entre idiomas; y una prueba que compara los códigos
  publicados en el OpenAPI con los que emite el núcleo.
- **Alternativas**: versionar el catálogo junto al código (descartada: ataría una corrección de
  reglas a un despliegue de aplicación y ocultaría la compatibilidad); mensajes literales en el
  núcleo (descartada por el Principio X y por la internacionalización, R10).

## R16. Arquitectura por etapas

- **Decisión**: el MVP se implementa en un solo lenguaje. El servicio de sondas en Python entra al
  empezar la versión 2, y solo si el análisis previsto (DNS con EDNS y DNSSEC, cadena de
  certificados con extensiones X.509 y transparencia, metadatos de página) no se resuelve con
  calidad suficiente con las bibliotecas estándar de Node; esa comparación se documenta en el plan
  de la versión 2. PostgreSQL, SQLAlchemy, Alembic y la cola de trabajos entran en la versión 3,
  con cuentas, historial, lotes e informes.
- **Razón**: Principio VII. Mientras no exista la funcionalidad, la infraestructura solo añade
  superficie que mantener; y la decisión sobre Python se toma cuando haya información para
  tomarla, no hoy a ciegas.
- **Consecuencia para el MVP**: no hay base de datos, no hay cola y no hay código Python de
  producción en el repositorio. El plan de la versión 2 vuelve a abrir esta decisión.

## R17. Paquete de contratos y verificación de fronteras

- **Decisión**: los esquemas de petición y respuesta de `/v1` viven en `packages/contracts`, no
  dentro de `apps/api`. El paquete contiene los esquemas Zod, el `openapi.json` generado en la
  compilación y los códigos de error del contrato derivados de la lista de `packages/core`. Las
  fronteras de dependencia entre paquetes se declaran y se comprueban en la integración continua
  con un comprobador de dependencias (`dependency-cruiser` o `eslint-plugin-boundaries`).
- **Razón**: el contrato `/v1` tiene cuatro consumidores —la API al servir, el navegador al llamar
  a Redirect Inspector, las pruebas de contrato de ambos lados y, en la versión 3, el SDK
  generado—, así que no es un detalle interno de la API (Principio IX). Y los Principios VIII y X
  solo se cumplen de verdad si una violación falla el build en lugar de depender de que alguien la
  vea en revisión.
- **Invariantes declaradas**: solo `apps/api/src/presentation/` puede importar `packages/i18n`,
  y únicamente para el parámetro opcional `?lang` que el contrato ya publica; el resto de la API
  devuelve códigos (Principio VIII); `packages/core` no depende de `packages/rules` (ver
  R18) ni de `contracts`, `i18n` o `ui`; `packages/contracts` solo importa de `core` la lista de
  códigos, para que el `enum` del OpenAPI no pueda divergir de lo que emite el núcleo;
  `packages/ui` no conoce el dominio.
- **Alternativas**: esquemas dentro de `apps/api` (descartada: el navegador y las pruebas de
  contrato tendrían que importar de una app, y el SDK de la versión 3 no tendría de dónde
  generarse); un paquete de "tipos compartidos" genérico (descartada: se convierte en un cajón
  donde acaba cayendo lógica de dominio, que es justo lo que el Principio VIII evita).
- **Nota**: `packages/contracts` contiene formas de datos de cable y validación, nunca reglas de
  producto. Si un esquema necesita saber qué es un parámetro de seguimiento, la lógica está mal
  ubicada.

## R18. El catálogo de reglas se inyecta en el núcleo

- **Decisión**: `packages/core` define los tipos del catálogo y **recibe** una instancia en las
  funciones que lo necesitan (`clean(url, { catalog, mode })`); no importa `packages/rules`. El
  adaptador —web o API— es quien carga el catálogo compilado y lo inyecta.
- **Razón**: tres motivos. El núcleo queda puro y se puede probar con catálogos mínimos escritos
  para un caso concreto, en lugar de depender del catálogo real de producción. El catálogo se
  versiona y publica con su propio ritmo —cambia a diario, el núcleo no— sin arrastrar un
  despliegue del núcleo. Y resuelve de forma natural la obligación del Principio X de declarar la
  versión del catálogo en cada respuesta: quien inyecta es quien conoce la versión.
- **Consecuencia**: las funciones de Smart Cleaner y de Explain URL que dependen de reglas reciben
  el catálogo como parte de sus opciones; su firma lo refleja desde la primera implementación.
  Las pruebas del núcleo usan catálogos sintéticos; el corpus de SC-002 se ejecuta en
  `packages/rules`, que es quien lo posee.
- **Alternativas**: que el núcleo importe el módulo compilado del catálogo (descartada: acopla el
  núcleo a los datos, impide probar casos límite con catálogos a medida y deja sin dueño claro la
  versión que hay que declarar en la respuesta); catálogo accesible por una variable global
  (descartada: estado implícito en un núcleo que debe ser determinista).

## R19. Alcance de la protección SSRF y vectores compartidos

- **Decisión**: toda la superficie de protección SSRF se implementa en el MVP, con Redirect
  Inspector, y los casos de prueba se mantienen como datos en `tests/ssrf-vectors/`, fuera de la
  suite que los ejecuta.
- **Razón**: Principio V. La protección no es divisible: la comprobación de rangos sin fijación de
  IP se sortea con DNS rebinding, y los límites de saltos y de cuerpo sin validación de esquema y
  puerto dejan la puerta abierta por otro lado. Entregar la mitad da una falsa sensación de
  cobertura, que es peor que no tener ninguna.
- **Por qué los vectores son datos y no código**: el servicio de sondas de la versión 2 hará
  peticiones salientes en Python y tendrá que aplicar la misma validación, porque ocurre en el
  proceso que conecta y no se puede delegar. Es la única duplicación de lógica admitida en el
  producto. Manteniendo los casos como datos neutros, un vector descubierto en un lenguaje protege
  automáticamente al otro, y la cobertura deja de depender de que alguien recuerde replicarlo.
- **Contenido de cada vector**: entrada (URL o nombre y respuesta del resolutor simulado) y
  veredicto esperado (`allow` o `block` con su motivo), de forma que la suite de cualquier lenguaje
  pueda recorrerlos sin conocer la implementación.
- **Alternativas**: vectores dentro de `apps/api/tests/ssrf` (descartada: el servicio en Python no
  podría ejecutarlos sin importar una suite de TypeScript); confiar en que la revisión de código
  detecte una validación incompleta en el segundo lenguaje (descartada: es exactamente el tipo de
  divergencia que esta arquitectura existe para evitar).

## R20. Contratos preparados para claves, cuotas por organización y persistencia

- **Decisión**: el OpenAPI de `/v1` declara desde el MVP un esquema de autenticación por clave de
  API en `Authorization: Bearer`, marcado como opcional en todos los endpoints y sin uso en el MVP.
  El sujeto de la cuota se modela como tipo discriminado con las tres variantes previstas
  (`anon-ip`, `api-key`, `organization`), de las que el MVP implementa solo la primera. Las claves
  de Valkey incluyen el tipo de sujeto en el prefijo. Los errores de autenticación y de cuota se
  declaran en `packages/contracts`, no en `packages/core`.
- **Razón**: Principio IV. Activar las claves en la versión 3 debe ser aditivo: los clientes
  anónimos siguen funcionando sobre el mismo `/v1`, sin versión mayor ni deprecación. Declarar el
  esquema después convertiría la autenticación en un cambio incompatible y obligaría a publicar
  `/v2` para algo que no cambia ninguna herramienta.
- **Por qué los códigos de autenticación y cuota no están en el núcleo**: autenticar y limitar es
  responsabilidad del adaptador (Principio VIII), así que sus códigos pertenecen al contrato. El
  núcleo solo declara los códigos que describen semántica de URLs. La prueba de paridad exige que
  todo código del núcleo esté en el OpenAPI; los códigos propios del contrato se declaran en
  `packages/contracts/src/errors.ts` y se marcan como tales.
- **Preparación para persistir sin persistir**: la versión aplicada del catálogo viaja en las
  respuestas que dependen de él (R15), y los identificadores de regla y los códigos de mensaje son
  estables, así que un informe almacenado en la versión 3 seguirá siendo interpretable cuando el
  catálogo haya avanzado. El MVP no guarda nada, de modo que la versión 3 empieza su esquema limpio
  y el núcleo nunca conoce inquilinos.
- **Códigos del contrato añadidos en la implementación**: además de `quota.exceeded`,
  `auth.missing` y `auth.invalid`, el contrato declara `request.invalid` (cuerpo que no cumple el
  esquema), `request.too-large` y `internal.error`. Son de la capa de transporte, no del núcleo.
- **El núcleo no depende de Zod** (T005): el registro usa una interfaz estructural `Schema<T>` que
  Zod cumple; los esquemas Zod del cable viven en `packages/contracts`.
- **Alternativas**: añadir la autenticación al contrato cuando haga falta (descartada por
  incompatible); una envoltura `{ data, meta }` en todas las respuestas desde el MVP por si acaso
  (descartada: complica hoy el 100 % de las respuestas por un beneficio hipotético, y el análisis
  por lotes de la versión 3 tendrá sus propios endpoints); guardar métricas en base de datos desde
  el MVP (descartada: los contadores agregados de Prometheus bastan y no hay nada que persistir).

## R21. Límites del servicio de sondas

- **Decisión**: el servicio Python de la versión 2 recibe del adaptador la URL ya validada y
  normalizada **junto con sus componentes** (esquema, host en Unicode y Punycode, puerto, ruta,
  parámetros). Para el transporte la URL es opaca; para la lógica usa los componentes recibidos.
  No analiza URLs, no implementa ninguna herramienta del núcleo, no declara dependencias de
  análisis de URLs, no mantiene catálogos propios y no guarda estado. Sí aplica la validación SSRF
  completa, contra los vectores compartidos de R19.
- **Razón**: es la condición para que el servicio pueda existir sin convertirse en un segundo
  núcleo. Toda la arquitectura se apoya en que la lógica de URLs tiene una sola implementación
  (R1); si el servicio de sondas analiza URLs, esa garantía desaparece en silencio.
- **Verificación**: una comprobación en CI revisa sus dependencias y falla si aparece un analizador
  de URLs (`ada-url` o equivalentes, o uso de `urllib.parse` para interpretar semántica). La regla
  no puede depender de la memoria de quien revisa.
- **Si una sonda necesita lógica de URLs que no existe**: se añade al núcleo TypeScript y se le pasa
  el resultado ya calculado; no se escribe en Python.
- **Alternativas**: pasarle solo la URL en crudo y dejar que la analice (descartada: obliga a tener
  analizador y abre la divergencia); exponer el núcleo por HTTP para que el servicio lo consulte
  (descartada para el alcance previsto: añade un salto de red y un punto de fallo en el camino
  crítico de cada sonda, cuando el adaptador ya tiene los componentes y puede enviarlos);
  compilar el núcleo a WebAssembly para invocarlo desde Python (descartada por ahora: resolvería la
  divergencia, pero añade complejidad de build que el alcance de la versión 2 no justifica; se
  reconsidera si una sonda necesitara lógica de URLs no trivial).

## R22. Páginas intermedias de salida (intersticiales)

- **Decisión**: cuando una respuesta HTML 2xx no trae `meta refresh` ni una redirección
  JavaScript literal, el núcleo busca en ella enlaces `<a href>` cuyo destino absoluto `http(s)`
  sea idéntico (tras resolverlo y serializarlo como URL) al valor decodificado de algún parámetro
  de consulta de la URL del propio salto. Si lo hay, el salto es de tipo `interstitial` y se
  sigue ese enlace. El criterio es genérico: no hay lista de sitios. El adaptador de red no cambia:
  ya entrega los primeros 256 KB del HTML (T071).
- **Razón**: avisos como `linkedin.com/safety/go/?url=…` no redirigen solos; hay que pulsar un
  enlace. Una página tiene muchos enlaces y no hay un estándar que diga cuál es "continuar", así
  que exigir que coincida con el destino que la URL ya declara es la única regla determinista que
  no obliga a mantener un catálogo por sitio y que no sigue enlaces arbitrarios.
- **Alternativas**: catálogo de intersticiales por sitio (descartada: el usuario quiere un criterio
  general y el catálogo envejece); seguir el primer enlace externo (descartada: no determinista y
  amplía lo que el servidor visita); leer el destino del parámetro sin visitar la página
  (descartada: eso ya lo hace Smart Cleaner al desenvolver; el inspector informa de lo que el
  servidor observa).
