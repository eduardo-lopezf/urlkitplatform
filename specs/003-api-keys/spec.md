# Feature Specification: Versión 3 de URLkit, primera parte — claves de API y cuotas por plan

**Feature Branch**: `003-api-keys`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "Versión 3 de URLkit, primera parte: claves de API y cuotas por plan.
Una organización puede usar la API /v1 con una clave de API en `Authorization: Bearer` y obtener
límites de uso mayores que el plan anónimo." Decisiones tomadas antes de redactar: las claves las
emite el operador con una herramienta de administración, sin registro web; no hay pagos; cada
clave pertenece a una organización. El alcance procede de `docs/arquitectura.md` (versión 3 y
sección 10) y del Principio IV de la constitución.

## Alcance de esta especificación

Cubre **solo la primera parte de la versión 3**: que una organización pueda usar la API pública con
una clave y obtener los límites de su plan. Es la pieza mínima que convierte URLkit en una
plataforma con API, y la primera vez que el producto guarda algo.

Quedan fuera, para especificaciones posteriores: registro y cuentas en la web, autoservicio de
claves, correos, pagos y facturación, consulta del consumo por parte del cliente, historial de
análisis, análisis por lotes, informes,
reputación de sitios y el SDK generado.

**Lo que no cambia**: la web y sus visitantes siguen siendo anónimos y no usan claves; las cuatro
herramientas locales siguen ejecutándose en el navegador sin llamar a la API; y quien use la API
sin clave obtiene exactamente el mismo comportamiento que hoy, sobre la misma versión de la API.

**Orden de entrega**: primero que el operador pueda crear organizaciones y claves y que la API las
acepte (sin eso no hay nada que probar); después, que cada organización reciba los límites de su
plan; por último, que el operador pueda revocar claves y ver el consumo.

## Clarifications

### Session 2026-11-13

- Q: ¿Además del límite común de la organización, debe poder tener cada clave su propio límite,
  más bajo? → A: No. Solo hay límites por organización; el consumo se mide por clave para poder
  verlo, pero no se limita por clave.
- Q: ¿Debe poder consultar una organización su propio consumo a través de la API, o solo lo ve el
  operador? → A: Solo el operador ve el consumo histórico. El cliente sabe lo que le queda por las
  cabeceras de límite de uso de cada respuesta; no hay endpoint de consumo en esta parte.
- Q: ¿Cuánto tiempo se guardan los recuentos de consumo de cada organización antes de borrarlos?
  → A: 13 meses; los recuentos más antiguos se borran solos.
- Q: ¿Un cambio de plan debe aplicarse en la petición siguiente o puede tardar un poco? → A: En
  menos de un minuto, como la revocación. La verificación de claves guarda en memoria el plan de la
  organización durante 30 s (plan, research R3) para no consultar el almacenamiento en cada
  petición y cumplir SC-004; exigir la petición siguiente obligaría a consultarlo siempre.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Usar la API con una clave emitida por el operador (Priority: P1)

Una empresa quiere integrar URLkit en su sistema. Pide acceso al operador de URLkit, que crea una
organización para ella y le emite una clave. La empresa la recibe una sola vez y la añade a sus
peticiones a la API. Sus peticiones se atribuyen a su organización, y cualquier otra persona sin
esa clave sigue usando la API de forma anónima.

**Why this priority**: es la base de todo lo demás. Sin claves emitidas y aceptadas no hay
organización a la que asignar un plan, ni consumo que medir.

**Independent Test**: el operador crea una organización y una clave; una petición a una
herramienta con esa clave se atribuye a la organización, y la misma petición sin clave se sigue
atendiendo como anónima.

**Acceptance Scenarios**:

1. **Given** una organización recién creada, **When** el operador le crea una clave, **Then** la
   clave completa se muestra una sola vez, junto con un identificador corto que no es secreto y
   sirve para referirse a ella después.
2. **Given** una clave válida, **When** se usa en una petición a cualquier herramienta de la API,
   **Then** la petición se atiende y se atribuye a la organización dueña de la clave.
3. **Given** una petición sin clave, **When** llega a la API, **Then** se atiende exactamente igual
   que antes de esta versión, con los límites del plan anónimo.
4. **Given** una clave que no existe o está mal formada, **When** se usa en una petición, **Then**
   la API la rechaza con el error de autenticación ya declarado en el contrato (`auth.invalid`) y no
   la atiende como anónima.
5. **Given** una clave creada, **When** el operador consulta las claves de la organización,
   **Then** ve el identificador corto, la fecha de creación y su estado, pero nunca la clave
   completa.

---

### User Story 2 - Límites de uso según el plan de la organización (Priority: P2)

El operador asigna a cada organización un plan. El plan fija cuántos usos de cada herramienta
puede hacer la organización por hora y por día. Todas las claves de una organización comparten esos
límites, y las cabeceras de límite de uso informan de lo que queda, igual que hoy con el plan
anónimo.

**Why this priority**: es el valor que justifica pedir una clave: límites mayores y
predecibles. Depende de la historia 1.

**Independent Test**: una organización con un plan de límites conocidos agota el límite de una
herramienta usando dos claves distintas; la siguiente petición, con cualquiera de las dos, recibe
el error de cuota con el tiempo de espera, y el resto de herramientas sigue disponible.

**Acceptance Scenarios**:

1. **Given** una organización con un plan, **When** hace peticiones con una clave, **Then** las
   cabeceras de límite de uso reflejan los límites y el consumo de su plan, no los del plan anónimo.
2. **Given** una organización con dos claves, **When** usa ambas, **Then** el consumo de las dos se
   suma contra los mismos límites de la organización.
3. **Given** que una organización ha agotado el límite de una herramienta, **When** hace una
   petición más a esa herramienta, **Then** recibe el error de cuota ya declarado
   (`quota.exceeded`) con el tiempo hasta que se renueve la ventana, y las demás herramientas
   siguen disponibles.
4. **Given** que el operador cambia el plan de una organización, **When** la organización hace
   peticiones un minuto después, **Then** se aplican los límites del plan nuevo.
5. **Given** el consumo de una organización, **When** se agota, **Then** el uso anónimo de otras
   personas no se ve afectado, y viceversa.

---

### User Story 3 - Revocar claves y conocer el consumo (Priority: P3)

Una clave se ha filtrado, o un cliente deja de serlo. El operador la revoca y deja de funcionar
enseguida. El operador también puede ver cuánto ha usado cada organización de cada herramienta,
para decidir su plan, sin que eso exija guardar qué URLs se analizaron.

**Why this priority**: es imprescindible antes de dar claves a terceros fuera de una prueba
controlada, pero no hace falta para comprobar que las claves y los planes funcionan.

**Independent Test**: el operador revoca una clave en uso; una petición con ella, poco después,
recibe `auth.invalid`, mientras la otra clave de la misma organización sigue funcionando. Después
consulta el consumo de la organización y ve los usos por herramienta y día.

**Acceptance Scenarios**:

1. **Given** una clave en uso, **When** el operador la revoca, **Then** las peticiones con esa clave
   se rechazan con `auth.invalid` en menos de un minuto.
2. **Given** una organización con varias claves, **When** se revoca una, **Then** las demás siguen
   funcionando.
3. **Given** una organización, **When** el operador consulta su consumo, **Then** ve cuántos usos
   hizo de cada herramienta por día y por clave, sin ninguna URL, consulta ni dirección IP.
4. **Given** una clave revocada, **When** el operador lista las claves, **Then** aparece como
   revocada, con la fecha, y no puede reactivarse: para volver a dar acceso se crea una clave nueva.
5. **Given** una organización, **When** el operador la desactiva, **Then** todas sus claves dejan de
   funcionar a la vez.

---

### Edge Cases

- Petición con la cabecera de autenticación vacía o con un esquema distinto de `Bearer`: se trata
  como clave no válida (`auth.invalid`), no como anónima. Solo la ausencia total de la cabecera es
  uso anónimo.
- Petición con clave a una herramienta local (Smart Cleaner, URL Parser, URL Diff, Explain URL) a
  través de la API: se atiende con los límites del plan para herramientas locales; la web no cambia.
- Plan que no define límite para una herramienta: esa herramienta usa los límites del plan anónimo,
  nunca ilimitado por omisión.
- El operador asigna a una organización un plan que no existe: la herramienta de administración lo
  rechaza sin cambiar nada.
- El almacenamiento de organizaciones y claves no está disponible: las peticiones con clave reciben
  un error temporal, no se atienden como anónimas ni con límites sin control; el uso anónimo sigue
  funcionando.
- Muchas peticiones con claves inventadas (intento de adivinarlas): se rechazan sin revelar si una
  clave existió o fue revocada, y cuentan contra la cuota anónima de quien las envía, de modo que
  probar claves al azar no sale gratis.
- Una clave aparece en un log, una traza o un informe de error por descuido: no debe ocurrir; la
  clave se trata como un secreto en toda la plataforma.

## Requirements *(mandatory)*

### Functional Requirements

**Claves y organizaciones**

- **FR-001**: El operador MUST poder crear, listar, desactivar y reactivar organizaciones mediante
  una herramienta de administración que no está expuesta en la API pública ni en la web.
- **FR-002**: El operador MUST poder crear claves para una organización, listarlas y revocarlas con
  esa misma herramienta.
- **FR-003**: Al crearse, la clave completa MUST mostrarse una sola vez. Después, la plataforma
  MUST NOT poder mostrarla ni recuperarla: solo guarda lo necesario para verificarla.
- **FR-004**: Cada clave MUST tener un identificador corto que no es secreto, con el que el operador
  y el cliente pueden referirse a ella (listados, revocación, consumo) sin manejar el secreto.
- **FR-005**: Una clave MUST pertenecer a exactamente una organización; una organización MAY tener
  varias claves activas a la vez, para poder rotarlas sin cortar el servicio.
- **FR-006**: Revocar una clave MUST ser definitivo; para devolver el acceso se crea una clave
  nueva.

**Autenticación en la API**

- **FR-010**: La API MUST aceptar la clave en la cabecera `Authorization` con el esquema `Bearer`,
  tal como declara el contrato desde el MVP, en todos sus endpoints de herramientas.
- **FR-011**: Una petición sin cabecera `Authorization` MUST atenderse exactamente como hoy (plan
  anónimo, mismos límites y mismas respuestas). Activar las claves MUST NOT requerir una versión
  nueva de la API ni cambiar ninguna respuesta existente.
- **FR-012**: Una petición con una clave no válida, revocada, de una organización desactivada, mal
  formada o con otro esquema MUST rechazarse con `auth.invalid`, sin atenderla como anónima y sin
  indicar cuál de esos casos es.
- **FR-013**: La revocación de una clave o la desactivación de una organización MUST surtir efecto
  en todas las instancias de la API en menos de un minuto.
- **FR-014**: La web MUST NOT enviar claves ni cambiar su comportamiento; las herramientas locales
  MUST seguir ejecutándose en el navegador sin llamar a la API (FR-006 del MVP).

**Planes y cuotas**

- **FR-020**: Un plan MUST definir, para cada grupo de herramientas que hoy tiene cuota, los límites
  por ventana (hora y día) que ya usa el plan anónimo.
- **FR-021**: Los planes MUST definirse de forma declarativa y versionada, revisables como el resto
  de datos del producto (Principio X), no creándolos a mano en el almacenamiento.
- **FR-022**: Cada organización MUST tener asignado exactamente un plan, que el operador puede
  cambiar; el cambio MUST surtir efecto en todas las instancias de la API en menos de un minuto,
  como la revocación (FR-013).
- **FR-023**: Los límites de un plan MUST aplicarse al conjunto de la organización: todas sus claves
  suman contra los mismos contadores. En esta parte no hay límites propios por clave; el consumo
  por clave solo se mide (FR-030).
- **FR-024**: Las peticiones con clave MUST devolver las mismas cabeceras de límite de uso y el mismo
  error de cuota (`quota.exceeded`, con el tiempo de espera) que hoy, con los valores del plan de la
  organización.
- **FR-025**: Si un plan no define límite para una herramienta, MUST aplicarse el del plan anónimo.
  Ningún plan MUST conceder uso ilimitado por omisión.
- **FR-026**: El consumo de una organización y el de los visitantes anónimos MUST contarse por
  separado: agotar uno no afecta al otro.
- **FR-027**: Las peticiones rechazadas con `auth.invalid` MUST contar contra la cuota anónima de
  quien las envía.

**Consumo**

- **FR-030**: La plataforma MUST medir el consumo por organización, clave, herramienta y día, como
  simples recuentos.
- **FR-031**: El operador MUST poder consultar ese consumo con la herramienta de administración. La
  API pública MUST NOT exponer el consumo histórico en esta parte: el cliente conoce lo que le queda
  por las cabeceras de límite de uso (FR-024).
- **FR-032**: El consumo medido MUST NOT incluir URLs, consultas, contenido analizado ni direcciones
  IP.
- **FR-033**: Los recuentos de consumo MUST conservarse 13 meses y borrarse automáticamente después,
  sin intervención del operador. `docs/privacidad.md` MUST publicar ese plazo (FR-046).

**Privacidad, seguridad y operación**

- **FR-040**: Lo único que la plataforma MUST guardar de forma duradera son organizaciones, planes
  asignados, claves (en una forma que no permite reconstruirlas) y recuentos de consumo. Nada de lo
  que se envía a las herramientas MUST guardarse (Principio V).
- **FR-041**: Una organización MUST poder identificarse solo con un nombre y una nota interna del
  operador; la plataforma MUST NOT exigir datos personales de contacto.
- **FR-042**: Las claves MUST NOT aparecer en logs, trazas, métricas ni informes de error, ni
  siquiera en las peticiones rechazadas. Como mucho puede aparecer su identificador corto.
- **FR-043**: Si el almacenamiento de organizaciones y claves no está disponible, las peticiones con
  clave MUST recibir un error temporal y el uso anónimo MUST seguir funcionando.
- **FR-044**: Los datos guardados MUST poder copiarse y restaurarse sin pérdida, con un
  procedimiento documentado y probado (SC-007).
- **FR-045**: El núcleo de herramientas MUST NOT conocer organizaciones, planes ni claves: todo vive
  en la capa de la API (Principios IV y VIII).
- **FR-046**: `docs/privacidad.md` MUST describir qué se guarda de las organizaciones que usan
  claves, durante cuánto tiempo y quién puede verlo, antes de emitir la primera clave a un tercero.

### Key Entities

- **Organización**: quien usa la API con clave. Tiene un nombre, una nota interna, un estado
  (activa o desactivada), un plan asignado y la fecha de alta. No guarda datos personales.
- **Clave de API**: credencial de una organización. Tiene un identificador corto no secreto, la
  forma verificable del secreto (nunca el secreto), la organización dueña, la fecha de creación y,
  si está revocada, la fecha de revocación.
- **Plan**: conjunto de límites por grupo de herramientas y ventana. Se define de forma declarativa
  y versionada; el plan anónimo actual es uno de ellos.
- **Consumo**: recuento de usos por organización, clave, herramienta y día. Solo números, que se
  conservan 13 meses.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El operador crea una organización con su plan y le emite una clave en menos de 2
  minutos.
- **SC-002**: El 100 % de las pruebas de contrato y de extremo a extremo existentes del uso anónimo
  pasan sin cambios después de activar las claves.
- **SC-003**: Una clave revocada, o de una organización desactivada, se rechaza en el 100 % de las
  peticiones hechas un minuto después de la revocación.
- **SC-004**: Usar una clave no hace las respuestas perceptiblemente más lentas: el tiempo hasta la
  respuesta con clave no supera en más de 50 ms al de la misma petición anónima en el 95 % de los
  casos.
- **SC-005**: Cero claves completas, URLs, consultas o direcciones IP en el almacenamiento, los
  logs, las trazas y los informes de error, verificado por pruebas automáticas.
- **SC-006**: El consumo que ve el operador coincide con el número de peticiones atendidas a cada
  organización en el 100 % de los casos de una prueba con recuentos conocidos.
- **SC-007**: Una copia de seguridad de los datos guardados se restaura en un entorno vacío y todas
  las claves activas siguen funcionando.

## Assumptions

- **Límites por clave más adelante**: si un cliente pide un límite propio por clave, se añade después
  sin cambiar el contrato (ver Clarifications).
- **Planes iniciales**: además del plan anónimo actual habrá al menos un plan para organizaciones,
  con límites mayores. Los valores concretos se fijan en el plan de implementación y pueden
  ajustarse después, porque los planes son datos versionados.
- **Sin caducidad automática**: las claves no caducan solas; se rotan creando una nueva y revocando
  la anterior. Una caducidad opcional puede añadirse después.
- **Entrega de la clave**: el operador hace llegar la clave al cliente por un canal fuera de la
  plataforma; la plataforma no envía correos en esta parte.
- **Un solo operador**: la herramienta de administración la usa el equipo de URLkit desde el
  servidor. No hay roles ni varios administradores en esta parte.
- **El error temporal** cuando el almacenamiento no está disponible es un código de transporte del
  contrato, como `internal.error`, o uno nuevo declarado en `packages/contracts`; se decide en el
  plan.
- **Persistencia**: es la primera vez que el producto guarda datos. La tecnología concreta, su
  despliegue y sus copias se deciden en el plan, de acuerdo con `docs/arquitectura.md` (versión 3)
  y el Principio VII.
- **Despliegue**: esta parte se valida primero en local; su despliegue va con el resto de la
  plataforma cuando se retome (001/T111–T114).
