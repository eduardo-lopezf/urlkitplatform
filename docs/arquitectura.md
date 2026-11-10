# Arquitectura de URLkit Platform

**Estado**: vigente | **Versión**: 1.2.0 | **Fecha**: 2026-11-06

Este documento describe la arquitectura de todo el producto y su evolución por etapas. La
[constitución](../.specify/memory/constitution.md) prevalece sobre él; cada plan de feature
(`specs/<id>/plan.md`) concreta cómo se aplica en su alcance.

- La **constitución** dice qué principios son irrenunciables.
- Este **documento** dice qué tecnologías los materializan y cuándo entra cada una.
- Los **planes de feature** dicen cómo se implementa un incremento concreto.

## 1. La decisión de fondo

> **TypeScript en el borde, Python cuando aparezca la red.**

El producto tiene una asimetría que determina la arquitectura entera:

- La lógica de URLs (limpiar, analizar, comparar, explicar) es **obligatoriamente de cliente**.
  El Principio V exige que no salga del navegador, el presupuesto exige respuesta en menos de
  100 ms y el modelo de producto —gratuito, sin cuenta y sin publicidad— solo es sostenible si
  ese uso tiene coste marginal cero.
- El análisis de red (redirecciones, DNS, TLS, cabeceras, metadatos, reputación) es
  **obligatoriamente de servidor**. Un navegador no puede hacerlo.

De ahí la regla: el lenguaje se elige **por frontera, no por capa**. No existe un "frontend en un
lenguaje y backend en otro"; existe un núcleo de URLs que debe ejecutarse en los dos lados —y por
tanto es TypeScript, con una sola implementación— y un conjunto de sondas de red que nunca se
ejecutan en el navegador —y por tanto pueden estar en el lenguaje que mejor las resuelva.

**Consecuencia no negociable**: la lógica de URLs tiene **una sola implementación**. Reescribirla
en un segundo lenguaje para el servidor crearía dos cuerpos de código que divergen con el tiempo
en la herramienta que define el producto. Si en el futuro hiciera falta invocarla desde otro
lenguaje, la vía es compilar el núcleo (a WebAssembly o a un módulo nativo), nunca reimplementarlo.

## 2. Pila vigente por etapas

El Principio VII prohíbe añadir infraestructura antes de que exista la funcionalidad que la
necesita. La columna **Etapa** es por tanto normativa: indica cuándo se permite introducir cada
tecnología.

### MVP (feature 001)

| Componente | Tecnología | Responsabilidad |
|---|---|---|
| Núcleo de lógica | TypeScript estricto, sin DOM ni red | Analizar, limpiar, comparar y explicar URLs |
| Catálogo de reglas | JSON versionado + compilación a módulo | Parámetros de seguimiento, envoltorios y reglas por dominio |
| Catálogo de mensajes | Códigos estables + textos es/en | Texto para personas, fuera del núcleo |
| Web | Astro estático + islas Vue 3 | Una página por herramienta e idioma, servida desde CDN |
| Sistema de diseño | Tokens CSS + componentes Vue | Coherencia visual y WCAG 2.2 AA |
| API pública | Node LTS + Hono | Endpoints `/v1` de las cinco herramientas |
| Contratos | Zod + `@hono/zod-openapi` | Validación y OpenAPI generado desde el mismo esquema |
| HTTP saliente | `undici` con `lookup` propio | Redirect Inspector con IP validada y fijada |
| Cuotas y cache | Valkey 8 | Contadores con caducidad por visitante seudonimizado |
| Observabilidad | OpenTelemetry + Prometheus + Sentry con depuración de datos | Trazas y métricas sin registrar URLs |
| Proxy / TLS | Caddy (solo si se autogestiona el despliegue) | HTTPS y enrutado |
| Contenedores | Docker Compose en desarrollo, imagen OCI en producción | API e inspector; la web va a CDN, no a Compose |
| Pruebas | Vitest, Playwright, axe, size-limit, Lighthouse CI | Puertas de calidad del Principio VI |

### Versión 2 — análisis técnico avanzado

| Componente | Tecnología | Responsabilidad |
|---|---|---|
| Servicio de sondas | Python + FastAPI | DNS, TLS, cabeceras HTTP, metadatos y análisis de seguridad |
| Contratos del servicio | Pydantic v2 | Validación y OpenAPI propio del servicio |
| DNS | dnspython | Consultas, EDNS, DNSSEC, resolvers personalizados |
| TLS | `ssl` + `cryptography` | Cadena de certificados, extensiones X.509, transparencia |
| HTTP (sondas) | HTTPX async | Cabeceras y metadatos de página |

El servicio de sondas es un proceso separado detrás del mismo gateway, con su propio contrato.
**No comparte código con el núcleo** y no contiene lógica de URLs: cuando necesita interpretar una
URL, recibe ya sus componentes del adaptador que lo invoca. Los límites exactos de lo que puede y
no puede hacer están en la sección 11, y son la condición para que el servicio exista.

### Versión 3 — plataforma

| Componente | Tecnología | Responsabilidad |
|---|---|---|
| Persistencia | PostgreSQL | Cuentas, organizaciones, claves de API, trabajos, informes, historial |
| ORM | SQLAlchemy 2 | Acceso a datos del servicio que posee el esquema |
| Migraciones | Alembic | Evolución del esquema |
| Cola de trabajos | arq (Python) o BullMQ (Node), según el servicio dueño | Análisis por lotes e informes |
| Pagos | Stripe | Planes y API de pago |

Hasta la versión 3 **no hay base de datos**: el MVP no tiene nada que persistir y el Principio V
prohíbe almacenar URLs.

## 3. Reparto de responsabilidades

```text
Navegador                          Servidor
─────────                          ────────
isla Vue  ──► núcleo TS            adaptador API (Hono)
             (mismo código)          │ valida contrato
                                     │ autentica y aplica cuotas
                                     │ mide
                                     ├─► núcleo TS  (herramientas de URL)
                                     ├─► cliente HTTP seguro  (Redirect Inspector)
                                     └─► servicio de sondas  (v2, por contrato)
```

- **Núcleo**: funciones puras. Sin red, sin DOM, sin reloj, sin almacenamiento, sin texto para
  personas. Es el único lugar donde viven las reglas de producto.
- **Adaptadores** (web y API): exponen el núcleo. Ver sección 4.
- **Servicios** (inspector y sondas): hacen el trabajo que requiere red, bajo contrato.

## 4. La API es un adaptador delgado

Materializa el Principio VIII. Un manejador de ruta de `/v1` tiene **exactamente** esta forma, y
en este orden:

1. **Validar** el contrato de entrada con el esquema declarado.
2. **Resolver identidad**: anónimo seudonimizado en el MVP, clave de API desde la versión 3.
3. **Aplicar cuotas** y límites de uso del plan.
4. **Invocar** el núcleo o un servicio, pasándole datos ya validados.
5. **Medir**: contadores agregados y trazas, sin URLs.
6. **Responder**: serializar el resultado y traducir los códigos de error del núcleo a códigos
   de estado HTTP y cuerpos del contrato.

### Lo que la API no puede hacer

- Decidir qué parámetro se elimina, con qué motivo o en qué modo.
- Normalizar, reconstruir o comparar URLs por su cuenta.
- Interpretar una cadena de redirecciones: decidir si hay bucle, si se agotó el límite de saltos
  o cuál es el destino final es lógica pura del núcleo; el servicio solo aporta los saltos
  observados.
- Generar texto para personas. Devuelve códigos; los textos los resuelve quien presenta.
  **Excepción acotada**: el contrato publica un parámetro opcional `?lang` que añade el texto del
  catálogo a cada código, para clientes que no quieren empaquetar los catálogos. Es una búsqueda
  en el catálogo, no composición de texto: vive en un único módulo de serialización
  (`apps/api/src/presentation/`), los códigos siguen presentes siempre y el texto nunca los
  sustituye.
- Contener condicionales sobre el *significado* del dato. Puede ramificar por resultado
  (éxito, error, cuota agotada), nunca por contenido de la URL.

### Cómo se detecta la desviación

- Una ruta que no se puede leer de arriba abajo en esos seis pasos tiene lógica mal ubicada.
- Un comportamiento que solo se puede probar arrancando el servidor tiene lógica mal ubicada.
- Una corrección de producto que solo cambia ficheros de `apps/api/src/routes` tiene lógica mal
  ubicada, salvo que sea de validación, autenticación, cuotas o serialización.

La revisión de código comprueba esto en cada cambio. El plan de cada feature lo verifica en su
comprobación de constitución.

## 5. Fronteras y contratos

El sistema habla TypeScript, Python y SQL. Ningún tipo cruza una frontera sin contrato
(Principio IX). Los tipos del consumidor **se generan**; no se escriben a mano en dos lenguajes.

| Frontera | Contrato | Formato | Versionado | Pruebas |
|---|---|---|---|---|
| Isla Vue ↔ núcleo | Tipos del paquete | TypeScript | Semántico del paquete | Unitarias del núcleo |
| Navegador ↔ API | `/v1` | OpenAPI generado desde Zod | Mayor en la ruta (`/v1`, `/v2`) | Contrato en ambos lados |
| Cliente externo ↔ API | `/v1` | OpenAPI publicado en `/v1/openapi.json` | Mayor en la ruta + deprecación anunciada | Contrato + ejemplos |
| API ↔ servicio de sondas (v2) | Contrato interno del servicio | OpenAPI generado desde Pydantic | Mayor en la ruta interna | Contrato en ambos lados |
| Núcleo ↔ catálogo de reglas | Esquema del catálogo | JSON Schema | Semántico propio (sección 6) | Validación en CI + corpus |
| Adaptadores ↔ catálogo de mensajes | Lista de códigos | Códigos + parámetros | Deprecación anunciada (sección 7) | Paridad de claves entre idiomas |
| Servicio ↔ Valkey | Convención de claves | Prefijo con versión | Prefijo nuevo al cambiar formato | Integración |
| Servicio ↔ PostgreSQL (v3) | Esquema SQL | Migraciones Alembic | Migración con plan de reversión | Integración |

Reglas que aplican a todas:

- Un servicio **nunca** accede al almacenamiento de otro, ni a sus tablas ni a sus claves de
  Valkey. La única vía es el contrato publicado.
- Todo contrato declara sus **modos de fallo**: códigos de error, tiempo de espera y qué debe
  hacer el consumidor cuando el proveedor no responde.
- Si el servicio de sondas cae, las herramientas del MVP siguen funcionando. La degradación es
  parcial y explícita, nunca un error genérico.
- Un cambio incompatible en cualquier frontera exige versión nueva y periodo de deprecación,
  igual que la API pública.

## 6. Fronteras dentro del monorepo

Las fronteras de la sección 5 son entre procesos. Dentro del monorepo hay otras que no cruzan
proceso pero que sostienen igualmente los Principios VIII y X, y que por tanto se verifican en la
integración continua con un comprobador de dependencias, no solo en revisión de código.

```text
rules ──(tipos)──► core ──(códigos)──► contracts
                    ▲                      │
i18n ──(claves)─────┘                      ▼
                                    [sdk generado] (v3)

apps/web  ──► core, rules, ui, i18n, contracts
apps/api  ──► core, rules, contracts
ui        ──► (nada del dominio)
```

| Invariante | Principio | Qué protege |
|---|---|---|
| Solo `apps/api/src/presentation/` importa `i18n` | VIII | La API devuelve códigos; el texto se resuelve solo si el cliente pide `?lang`, y en un único módulo |
| `core` no depende de `rules` | X | El catálogo se inyecta; el núcleo es probable con catálogos sintéticos y quien inyecta declara la versión aplicada |
| `core` no depende de nada del repositorio salvo tipos | I | El núcleo se ejecuta igual en navegador y servidor |
| `contracts` solo importa de `core` la lista de códigos | X | El `enum` del OpenAPI y lo que emite el núcleo no pueden divergir |
| `ui` no conoce el dominio | III | Los componentes se reutilizan entre herramientas |

### El catálogo se inyecta, no se importa

El núcleo define los tipos del catálogo de reglas y recibe una instancia; no lo importa. Esto es
lo que permite cumplir la obligación de la sección 7 de declarar la versión aplicada en cada
respuesta: quien inyecta el catálogo es quien conoce su versión. Además desacopla el ritmo de
publicación —el catálogo cambia a diario, el núcleo no— y hace el núcleo probable con catálogos
mínimos escritos para un caso.

### Dónde vive cada cosa que podría duplicarse

| Artefacto | Dueño único | Quién lo consume |
|---|---|---|
| Lista de códigos de mensaje | `packages/core` | `i18n` como claves, `contracts` para el `enum` del OpenAPI |
| Textos para personas | `packages/i18n` | Solo la web y otros adaptadores de presentación |
| Esquemas de petición y respuesta | `packages/contracts` | La API al servir, el navegador al llamar, las pruebas de contrato, el SDK generado |
| Reglas de limpieza | `packages/rules` | Inyectadas en el núcleo por el adaptador |
| Dockerfile de un servicio | El propio servicio | Su propia construcción |
| Configuración entre servicios | `infrastructure/` | Compose y el despliegue |

### Pruebas

Las pruebas viven junto a lo que prueban, para que cada paquete pueda probarse de forma aislada
(Principio I). El directorio `tests/` de la raíz es solo para lo que atraviesa dos unidades de
despliegue o dos lenguajes:

- `tests/ssrf-vectors/` **existe desde el MVP**: son datos, no código, y los ejecuta la suite de
  TypeScript; cuando aparezca el servicio en Python ejecutará los mismos (sección 9).
- Las suites de contrato entre la API y el servicio de sondas llegan con la versión 2.

### Lo que no se crea todavía

| Directorio | Etapa | Por qué no antes |
|---|---|---|
| `services/probes/` | v2 | Principio VII: no hay funcionalidad que lo necesite (sección 11) |
| Suites en `tests/` de la raíz | v2 | En el MVP no hay suite que cruce despliegues; `tests/ssrf-vectors/` sí existe desde el MVP, porque son datos compartidos entre lenguajes |
| `packages/sdk/` | v3 | La web no llama a la API para las herramientas locales; hasta que haya consumidores externos no hay a quién dar soporte. Cuando exista será **generado** desde `openapi.json`, con verificación en CI de que está al día: el Principio IX prohíbe mantener a mano una segunda definición de los tipos |

## 7. Catálogo de reglas: versionado y compatibilidad

El catálogo es un artefacto de contrato con **versionado semántico propio**, independiente del
código (Principio X).

- **PATCH**: corrección de un motivo, de metadatos o de una plataforma mal etiquetada, sin
  cambiar qué se elimina.
- **MINOR**: reglas nuevas. Es el cambio habitual y no requiere coordinación con los clientes.
- **MAJOR**: cambiar el significado o el identificador de una regla existente, moverla entre
  modos `safe` y `max`, o eliminarla.

Obligaciones:

- Cada regla tiene un **identificador estable** y un motivo asociado; el identificador no se
  reutiliza nunca para otra regla.
- El esquema valida el catálogo en la integración continua; un catálogo inválido no se publica.
- Cada regla nueva **debe** añadir al menos un caso al corpus de URLs reales.
- El módulo compilado expone la versión del catálogo, y **toda respuesta que dependa de él
  indica la versión aplicada**. Un resultado de limpieza es así reproducible y auditable: quien
  integre la API puede saber con qué catálogo se produjo.
- Mover una regla de `safe` a `max` o al contrario es un cambio mayor, porque altera el resultado
  por defecto de la herramienta principal.

## 8. Catálogo de mensajes: códigos estables

Los códigos de mensaje son **parte del contrato público**, no un detalle de presentación: los
clientes de la API ramifican su código a partir de ellos.

- El núcleo devuelve `{ code, params }` y **nunca** texto para personas.
- Los textos viven en el catálogo por idioma, separados del núcleo. Una prueba exige que todos los
  idiomas tengan el mismo conjunto de claves.
- Un **texto** puede corregirse o reescribirse en cualquier momento, sin cambio de versión.
- Un **código** publicado no cambia de significado ni desaparece sin deprecación anunciada.
  Si el significado cambia, se publica un código nuevo y el anterior se marca obsoleto.
- Los códigos de error de la API se documentan en el OpenAPI con el mismo identificador que usa
  el núcleo, para que no haya traducción intermedia que pueda divergir.
- La estructura del código es jerárquica y estable: `<herramienta>.<categoría>.<caso>`
  (por ejemplo `clean.removed.tracking-param`, `explain.signal.userinfo-deception`).

## 9. Seguridad de las peticiones salientes

**Completa desde el MVP.** No se entrega por partes ni se aplaza a la versión 2. Redirect
Inspector es la primera herramienta que sale a la red, así que toda la superficie se implementa
con ella; cuando llegue el servicio de sondas no habrá nada que añadir, solo la misma validación
aplicada en otro lenguaje.

### Superficie completa

| Control | Qué hace |
|---|---|
| Resolución y fijación de IP | Resuelve el nombre, valida **todas** las IPs resueltas y conecta a la IP validada. Cierra la ventana de DNS rebinding entre validar y conectar |
| Rangos bloqueados IPv4 | Privadas, loopback, link-local (incluido `169.254.169.254`), CGNAT, multicast, reservadas y no especificadas |
| Rangos bloqueados IPv6 | `::1`, `fc00::/7`, `fe80::/10` y direcciones IPv4 mapeadas |
| Esquemas | Solo `http` y `https` |
| Credenciales | Se rechaza cualquier URL con usuario o contraseña |
| Puertos | Lista permitida: 80, 443, 8080, 8443 |
| Redirecciones | Las sigue el servicio salto a salto; el cliente HTTP **no** las sigue por su cuenta. La validación completa se repite en cada salto |
| Límites | 20 saltos, 5 s por salto, 15 s en total, 256 KB de cuerpo y solo en respuestas HTML |
| Proxy | No se honran las variables de entorno de proxy: romperían la fijación de IP |
| Cookies | No se envían ni se almacenan |
| Egress de red | Segunda barrera: el contenedor sale por una red que bloquea los rangos internos |
| Errores de TLS | Detienen la cadena en ese salto, con su código |

La restricción de egress es una barrera adicional, **no** un sustituto de la validación en el
cliente HTTP: protege de un fallo en el código, no al revés.

### Vectores compartidos entre lenguajes

El servicio de sondas de la versión 2 hará peticiones salientes en Python, y esa validación no se
puede delegar: ocurre en el momento de conectar, dentro del proceso que conecta. Es **la única
duplicación de lógica admitida en el producto**, y precisamente por eso no se sostiene sobre la
confianza.

El conjunto de vectores de prueba vive en `tests/ssrf-vectors/` como datos independientes del
lenguaje —cada caso es una entrada y el veredicto esperado— y lo ejecutan tanto la suite de
TypeScript como, cuando exista, la de Python. Un vector nuevo descubierto en un lenguaje protege
automáticamente al otro. Es el primer habitante del `tests/` de la raíz, cuyo propósito es
exactamente este: lo que cruza dos lenguajes.

## 10. Preparado para la plataforma: claves, cuotas y persistencia

El MVP no tiene cuentas, ni claves, ni base de datos. Pero los contratos se diseñan ahora para que
añadirlas no sea un cambio incompatible (Principio IV).

### Autenticación declarada desde la primera versión

El OpenAPI de `/v1` **declara** su esquema de autenticación —clave de API en
`Authorization: Bearer`— y lo marca como opcional en todos los endpoints. En el MVP ninguna
petición la necesita y el plan anónimo es el único que existe. Activar las claves en la versión 3
es entonces aditivo: los clientes anónimos siguen funcionando sobre el mismo `/v1`, sin versión
nueva y sin deprecación.

La alternativa —no declararla y añadirla después— convertiría la autenticación en un cambio
incompatible y obligaría a publicar `/v2` para algo que no cambia ninguna herramienta.

### El sujeto de la cuota es un tipo discriminado

```text
Subject
├── { type: 'anon-ip',      hash }                    MVP
├── { type: 'api-key',      keyId, organizationId }   v3
└── { type: 'organization', organizationId }           v3  (cuota agregada del plan)
```

El MVP implementa solo la primera variante, pero el tipo y la interfaz que lo resuelve existen con
las tres desde el principio, y las cabeceras `RateLimit-*` son idénticas para todas. Así el
limitador no cambia de forma cuando aparezcan las organizaciones: cambia de qué sujeto recibe.

Las claves de Valkey llevan el tipo de sujeto en el prefijo
(`quota:{tool}:{window}:{windowStart}:{subjectType}:{subjectId}`), de modo que convivir con varios
tipos de sujeto no obliga a migrar los contadores existentes.

### Preparado para persistir sin persistir todavía

- **Reproducibilidad**: toda respuesta que dependa del catálogo declara la versión aplicada
  (sección 7). Es lo que permitirá que un informe almacenado en la versión 3 siga siendo
  interpretable cuando el catálogo haya avanzado.
- **Identidad estable**: los identificadores de regla y los códigos de mensaje son estables
  (secciones 7 y 8), así que un registro histórico no queda huérfano.
- **Nada que migrar**: el MVP no guarda nada, por lo que la versión 3 empieza su esquema limpio,
  sin arrastrar migraciones vacías ni decisiones tomadas sin datos.
- **El núcleo no conoce inquilinos**: cuentas, organizaciones y planes viven en el adaptador
  (Principios IV y VIII). Añadir multi-tenencia no toca el núcleo ni el catálogo.
- **Códigos de transporte separados**: los errores de autenticación y de cuota pertenecen al
  contrato, no al núcleo, porque son responsabilidad del adaptador. Se declaran en
  `packages/contracts` y no en `packages/core`.

## 11. Cuándo entra el servicio Python

El Principio VII prohíbe añadirlo antes de que haga falta. La condición de activación es:

> El servicio de sondas en Python entra cuando empiece la implementación de la versión 2, y solo
> si el análisis previsto (DNS con EDNS y DNSSEC, cadena de certificados con extensiones X.509 y
> transparencia, metadatos de página) no se resuelve con calidad suficiente con las bibliotecas
> estándar de Node.

Esa comprobación se documenta en el plan de la versión 2, con la comparación concreta que la
justifique. Si Node resuelve el alcance real, el sistema se queda en un solo lenguaje y esta
sección se cierra sin abrir la frontera.

Mientras no se cumpla la condición, el repositorio no contiene código Python de producción.

### Lo que el servicio de sondas no puede hacer

Es un servicio de red, no un segundo núcleo. Estas reglas no son recomendaciones: son la condición
para que exista.

- **No analiza URLs.** Recibe del adaptador la URL ya validada y normalizada **junto con sus
  componentes** (esquema, host en Unicode y Punycode, puerto, ruta, parámetros). Para el
  transporte la URL es opaca; para la lógica usa los componentes que le llegan. Así no necesita un
  analizador propio y no puede divergir del núcleo.
- **No implementa ninguna herramienta del núcleo.** Nada de limpiar, comparar, explicar ni
  reconstruir. Si una sonda necesita lógica de URLs que no existe, se añade al núcleo TypeScript y
  se le pasa el resultado; no se escribe en Python.
- **No declara dependencias de análisis de URLs.** Ni `urllib.parse` para interpretar semántica, ni
  `ada-url`, ni equivalentes. Una comprobación en la integración continua revisa sus dependencias
  y falla si aparece una: es la forma de que la regla no dependa de la memoria de quien revisa.
- **No mantiene catálogos propios** de reglas ni de mensajes. Emite códigos del catálogo común.
- **No guarda estado.** Hasta la versión 3 no hay persistencia; después, el dueño del esquema es
  el servicio que lo crea y nadie más accede a sus tablas (Principio IX).
- **Sí aplica la validación SSRF completa** (sección 9), demostrada contra los vectores
  compartidos. Es lo único que replica, porque ocurre en el proceso que conecta y no se puede
  delegar.

La frontera es el contrato OpenAPI del servicio, con su propio versionado. Si la API cae, las
herramientas locales siguen funcionando; si el servicio de sondas cae, se degradan las
herramientas de la versión 2 y nada más.

## 12. Observabilidad

El Principio V prohíbe registrar URLs, lo que obliga a diseñar la observabilidad a propósito en
lugar de confiar en los logs.

- **Métricas** agregadas sin etiquetas que identifiquen visitantes.
- **Trazas** con OpenTelemetry: dominio registrable como máximo, nunca ruta, consulta ni
  fragmento; los tramos de red registran duración, código de estado y resultado.
- **Errores** con depuración de datos activa y verificada por una prueba: ningún campo de la
  entrada llega al servicio de errores.
- Los identificadores de visitante que aparezcan en cualquier señal son el seudónimo rotatorio,
  nunca la IP.

## 13. Despliegue

- La web es **estática y va a CDN**. Es lo que hace que las herramientas locales tengan coste
  marginal cero, y por tanto no se sirve desde un contenedor propio.
- La API es un contenedor OCI sin estado y escalable horizontalmente. En el MVP corre en un único
  VPS autogestionado con Compose (perfil `selfhosted`) junto a Valkey, Caddy y `egress-guard`; pasa
  a un proveedor con autoescalado y Valkey gestionado cuando el tráfico lo pida (research R12).
- Si la API cae, las cuatro herramientas locales siguen funcionando; solo se degrada Redirect
  Inspector.
- Docker Compose es para desarrollo y para despliegues autogestionados pequeños. Si se autogestiona,
  Caddy termina TLS; con un proveedor gestionado, esa pieza no existe.
- El tráfico saliente del inspector sale por una red con egress restringido, como segunda barrera
  además de la validación de IP en el cliente HTTP.

## 14. Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Backend Python para todo el producto | Obliga a una segunda implementación del núcleo de URLs en JavaScript para el navegador: dos cuerpos de código divergentes en la herramienta que define el producto. Además, `urllib.parse` sigue RFC 3986 y no el WHATWG URL Standard que exige el Principio II; requeriría bindings de `ada-url` |
| Nuxt 3 para la web | Framework de aplicación para lo que son páginas independientes sin estado compartido; hidrata y añade payload donde no hay interacción, consumiendo el presupuesto de 150 KB por página. Las islas Vue sobre Astro dan el mismo lenguaje de componentes sin ese coste |
| Núcleo en Rust o Go compilado a WebAssembly | Rendimiento innecesario para cadenas cortas, a cambio de peso inicial y complejidad de build |
| API en funciones edge | No permiten validar la IP resuelta antes de conectar, requisito de la protección SSRF |
| PostgreSQL y colas desde el MVP | No hay nada que persistir ni que encolar; el Principio VII lo prohíbe |
| Celery para la versión 3 | Orientado a trabajadores sincrónicos; conviven mal con FastAPI y HTTPX async. `arq` o Dramatiq encajan mejor |
| SSRF por etapas: bloquear rangos ahora y fijar la IP en la v2 | Una validación incompleta no reduce el riesgo, lo oculta: sin fijación de IP, la comprobación de rangos se puede sortear con DNS rebinding. Es todo o nada |
| Listas de bloqueo por nombre de host | Insuficientes ante DNS rebinding y ante nombres que resuelven a direcciones internas |
| Añadir la autenticación al contrato cuando haga falta | Convertiría activar las claves en un cambio incompatible y obligaría a publicar `/v2` para algo que no cambia ninguna herramienta |
| Analizar URLs también en el servicio de sondas | Sería el segundo núcleo que toda la arquitectura evita; recibe los componentes ya analizados |

## 15. Registro de cambios

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0.0 | 2026-11-06 | Documento inicial: decisión de fondo, pila por etapas, adaptador delgado, fronteras, versionado de reglas y mensajes, condición de activación del servicio Python |
| 1.1.0 | 2026-11-06 | Estructura del repositorio revisada: paquete `contracts`, fronteras internas verificadas en CI, catálogo inyectado en el núcleo, ubicación y aplazamiento de `services/probes`, `tests/` y `sdk` |
| 1.2.0 | 2026-11-06 | Superficie SSRF completa desde el MVP con vectores compartidos entre lenguajes; contratos preparados para claves de API, cuotas por organización y persistencia futura; límites estrictos del servicio de sondas |
| 1.3.0 | 2026-11-10 | Despliegue del MVP en un VPS autogestionado con Compose; proveedor gestionado con autoescalado y Valkey gestionado cuando el tráfico lo pida |
