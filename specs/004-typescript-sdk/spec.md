# Feature Specification: Versión 3 de URLkit, segunda parte — SDK de TypeScript para la API

**Feature Branch**: `004-typescript-sdk`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "Versión 3 de URLkit, segunda parte: SDK de TypeScript generado para
la API /v1. Quien integra URLkit con una clave de API usa un paquete TypeScript en lugar de
escribir a mano las peticiones, los tipos y el manejo de errores." Decisiones tomadas antes de
redactar: solo TypeScript; paquete del monorepo listo para publicar, sin publicarlo todavía; tipos
generados desde el contrato y ayudas finas escritas a mano. El alcance procede de
`docs/arquitectura.md` (versión 3, `packages/sdk/`) y del Principio IX de la constitución.

## Alcance de esta especificación

Cubre **solo el SDK de TypeScript**: un paquete con el que una integración llama a las
herramientas de `/v1`, con o sin clave de API, sin escribir a mano las peticiones, los tipos ni el
manejo de errores y límites.

Quedan fuera: SDKs en otros lenguajes (cualquier lenguaje puede generar su cliente desde el
contrato público `/v1/openapi.json`), publicar el paquete en un registro público, el uso desde el
navegador, y cualquier cambio en la API o en su contrato.

**Lo que no cambia**: la API, su contrato y su versión; la web, que no usa el SDK; y quien llama a
la API sin SDK, que la sigue usando igual.

**Orden de entrega**: primero las llamadas tipadas (sin ellas no hay SDK); después los errores y
los límites, que es lo que una integración necesita para portarse bien; luego la comprobación de
que el SDK no se queda atrás del contrato; y por último los reintentos opcionales.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Llamar a las herramientas con tipos (Priority: P1)

Una empresa integra URLkit en su servidor. Instala el paquete, crea un cliente con su clave y llama
a una herramienta, por ejemplo limpiar una URL. Su editor le muestra qué datos pide cada
herramienta y qué devuelve, y un error de tipos le avisa antes de ejecutar si pasa algo que la API
no acepta. Si no tiene clave, usa el mismo cliente de forma anónima.

**Why this priority**: es el propósito del SDK. Sin llamadas tipadas a todas las herramientas no hay
nada más que ofrecer.

**Independent Test**: en un proyecto nuevo, se instala el paquete, se crea un cliente y se llama a
cada herramienta de `/v1` contra una API local; cada llamada devuelve el resultado con su tipo, con
clave y sin ella.

**Acceptance Scenarios**:

1. **Given** un cliente creado con una clave, **When** llama a una herramienta, **Then** la petición
   lleva la clave en `Authorization: Bearer` y devuelve el resultado con el tipo que declara el
   contrato.
2. **Given** un cliente creado sin clave, **When** llama a una herramienta, **Then** la petición se
   hace de forma anónima, sin cabecera de autorización.
3. **Given** cualquier herramienta de `/v1`, **When** se busca en el SDK, **Then** hay una llamada
   para ella, con los datos de entrada y la respuesta tipados.
4. **Given** una llamada con datos que el contrato no acepta (un campo que falta o de otro tipo),
   **When** se compila el código de la integración, **Then** el compilador lo marca como error.
5. **Given** un cliente, **When** se le indica otra dirección de la API (por ejemplo, una local o
   de pruebas), **Then** las llamadas van a esa dirección.

---

### User Story 2 - Errores y límites de uso tratables (Priority: P2)

La integración necesita reaccionar bien cuando algo no sale: esperar si ha agotado su cuota, avisar
si su clave ya no vale, corregir una entrada mal formada. El SDK convierte cada respuesta de error
en un error con el código del contrato, de modo que la integración decide por código y no por el
texto. En cada respuesta, buena o mala, la integración puede leer cuánto le queda de su cuota.

**Why this priority**: sin esto, cada integración reimplementa el manejo de `401`, `429` y `503`, y
es fácil hacerlo mal (por ejemplo, reintentar en bucle). Depende de la historia 1.

**Independent Test**: con una API local, se provocan una entrada inválida, una clave no válida, una
cuota agotada y un almacenamiento no disponible; cada caso llega como un error con su código y,
donde corresponde, con el tiempo de espera; en una respuesta correcta se leen los límites restantes.

**Acceptance Scenarios**:

1. **Given** una respuesta de error de la API, **When** el SDK la recibe, **Then** la integración
   obtiene un error con el código del contrato (`quota.exceeded`, `auth.invalid`, `auth.unavailable`,
   `request.invalid` o un código de las herramientas) y el estado HTTP.
2. **Given** un error `quota.exceeded` o `auth.unavailable`, **When** la integración lo inspecciona,
   **Then** tiene los segundos de espera que indicó la API.
3. **Given** cualquier respuesta, correcta o de error, **When** la integración la inspecciona,
   **Then** puede leer el límite, lo que queda y cuándo se renueva la ventana, tal como lo indicó la
   API en sus cabeceras de límite de uso.
4. **Given** un fallo de red o una API que no responde, **When** el SDK lo detecta, **Then** la
   integración recibe un error distinto de los de la API, que no se confunde con un código del
   contrato.
5. **Given** cualquier error, **When** se convierte en texto o se registra, **Then** no contiene la
   clave de API.

---

### User Story 3 - El SDK no se queda atrás del contrato (Priority: P3)

El equipo de URLkit cambia el contrato de la API: añade una herramienta, un campo o un código. El
SDK se regenera desde el contrato, y si alguien olvida regenerarlo, la integración continua lo
detecta antes de integrar el cambio.

**Why this priority**: es lo que hace que el SDK siga siendo fiable con el tiempo, y lo que la
constitución exige (Principio IX: los tipos del consumidor se generan, nunca se escriben a mano).
No hace falta para usar el SDK hoy.

**Independent Test**: se cambia el contrato sin regenerar el SDK y la comprobación de la
integración continua falla; se regenera y pasa.

**Acceptance Scenarios**:

1. **Given** el contrato publicado, **When** se regenera el SDK, **Then** sus tipos salen enteros
   del contrato, sin tipos escritos a mano para las peticiones ni las respuestas.
2. **Given** un cambio en el contrato sin regenerar el SDK, **When** pasa la integración continua,
   **Then** falla y dice que el SDK está desactualizado.
3. **Given** una herramienta nueva en el contrato, **When** se regenera el SDK, **Then** la
   comprobación falla hasta que exista su llamada tipada, de modo que ninguna herramienta queda sin
   llamada.

---

### User Story 4 - Reintentos opcionales que respetan la API (Priority: P4)

Una integración que procesa muchas URLs prefiere que el SDK espere y reintente cuando se agota la
cuota o el almacenamiento de claves no responde un momento. Lo activa explícitamente y el SDK
reintenta solo en esos casos, esperando lo que la API indica y sin pasar del número de intentos
configurado.

**Why this priority**: es una comodidad; sin ella, la integración hace lo mismo con el error
tipado de la historia 2. Desactivado por defecto, para no esconder la cuota a quien no lo pida.

**Independent Test**: con una API local que responde `429` con un tiempo de espera y después `200`,
un cliente con reintentos activados espera ese tiempo y devuelve el resultado; con reintentos
desactivados devuelve el error enseguida; con `401` nunca reintenta.

**Acceptance Scenarios**:

1. **Given** un cliente sin configurar reintentos, **When** recibe `429` o `503`, **Then** devuelve
   el error sin reintentar.
2. **Given** un cliente con reintentos activados, **When** recibe `429` o `503` con un tiempo de
   espera, **Then** espera ese tiempo y reintenta, hasta el número máximo de intentos configurado.
3. **Given** un cliente con reintentos activados, **When** recibe `401`, `400` u otro error de la
   petición, **Then** no reintenta.
4. **Given** un tiempo de espera mayor que el máximo que admite la integración, **When** llega,
   **Then** el SDK no espera y devuelve el error, para que la integración decida.

---

### Edge Cases

- La API devuelve un código que el SDK no conoce (porque es más nuevo que el SDK): la integración
  recibe el error con ese código tal cual, sin perderlo ni convertirlo en un error genérico.
- Una respuesta de error sin cuerpo o con un cuerpo que no es del contrato (por ejemplo, de un
  proxy intermedio): la integración recibe un error con el estado HTTP y un código que indica que la
  respuesta no era de la API.
- `Retry-After` ausente en un `429` o un `503`: con reintentos activados, se usa una espera por
  defecto razonable y acotada.
- Una llamada cancelada por la integración (por ejemplo, porque su propia petición terminó): la
  llamada se aborta y no se reintenta.
- Uso en un navegador: no es un caso admitido; la documentación lo dice y el SDK no hace nada
  especial para permitirlo, porque una clave en una página web queda expuesta.
- Una clave con un formato que no es el de URLkit: el SDK la envía igualmente y es la API la que
  responde `auth.invalid`; el SDK no valida claves por su cuenta.

## Requirements *(mandatory)*

### Functional Requirements

**Llamadas**

- **FR-001**: El SDK MUST ofrecer una llamada por cada herramienta de `/v1`, con la entrada y la
  respuesta tipadas según el contrato publicado.
- **FR-002**: El SDK MUST aceptar una clave de API opcional al crear el cliente y enviarla en
  `Authorization: Bearer` en cada llamada; sin clave, las llamadas son anónimas.
- **FR-003**: El SDK MUST permitir indicar la dirección base de la API; por defecto MUST usar la de
  producción que declara el contrato.
- **FR-004**: El SDK MUST permitir cancelar una llamada en curso.
- **FR-005**: El SDK MUST NOT hacer ninguna petición que la integración no haya pedido: sin
  telemetría, sin comprobaciones de versión y sin precargas.

**Errores y límites**

- **FR-010**: Toda respuesta de error de la API MUST llegar a la integración como un error con el
  código del contrato y el estado HTTP. Un código desconocido para el SDK MUST conservarse tal cual.
- **FR-011**: Los errores `quota.exceeded` y `auth.unavailable` MUST exponer los segundos de espera
  que indicó la API.
- **FR-012**: Toda respuesta, correcta o de error, MUST permitir leer el límite, lo restante y el
  momento de renovación que indicó la API en sus cabeceras de límite de uso, cuando las haya.
- **FR-013**: Los fallos de red, los tiempos agotados y las respuestas que no son del contrato MUST
  llegar como errores distinguibles de los de la API.
- **FR-014**: Ningún error, mensaje ni representación en texto del SDK MUST contener la clave de
  API.

**Contrato y generación**

- **FR-020**: Los tipos de peticiones y respuestas MUST generarse desde el contrato publicado
  (`openapi.json`); el SDK MUST NOT contener tipos escritos a mano que dupliquen el contrato
  (Principio IX).
- **FR-021**: La integración continua MUST fallar si el SDK no está al día con el contrato.
- **FR-022**: La integración continua MUST fallar si una herramienta del contrato no tiene su
  llamada en el SDK.
- **FR-023**: El SDK MUST probarse contra la API real del repositorio, no solo contra respuestas
  simuladas, en al menos una llamada por herramienta.

**Reintentos**

- **FR-030**: Los reintentos MUST estar desactivados por defecto.
- **FR-031**: Con los reintentos activados, el SDK MUST reintentar solo ante `429` y `503`,
  esperando el tiempo que indicó la API, hasta un número máximo de intentos configurable.
- **FR-032**: El SDK MUST NOT reintentar ante `401` ni ante otros errores `4xx` distintos de `429`,
  ni una llamada cancelada.
- **FR-033**: Si el tiempo de espera indicado supera el máximo configurado por la integración, el
  SDK MUST devolver el error sin esperar.

**Distribución**

- **FR-040**: El paquete MUST estar listo para publicarse en un registro público con una sola
  orden: nombre, licencia, versión, ficheros compilados con sus tipos y documentación de uso.
- **FR-041**: El paquete MUST NOT publicarse como parte de esta feature; publicarlo es una decisión
  de la persona.
- **FR-042**: La versión del paquete MUST seguir el versionado semántico y declarar con qué versión
  del contrato se generó.
- **FR-043**: La documentación del paquete MUST explicar la instalación, la creación del cliente
  con y sin clave, el manejo de errores y límites, los reintentos, y que las claves no deben usarse
  en un navegador.

### Key Entities

- **Cliente**: el punto de entrada de una integración. Guarda la dirección de la API, la clave
  opcional y la configuración de reintentos. No guarda nada entre llamadas.
- **Respuesta**: el resultado tipado de una herramienta, más la información de límites de uso de
  esa respuesta.
- **Error de la API**: código del contrato, estado HTTP, mensaje y, cuando corresponde, segundos
  de espera y límites de uso.
- **Error de transporte**: fallo de red, tiempo agotado, cancelación o respuesta que no es de la
  API.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona que no conoce el SDK hace su primera llamada correcta en menos de 5
  minutos desde la instalación, siguiendo solo la documentación del paquete.
- **SC-002**: El 100 % de las herramientas de `/v1` tienen su llamada tipada en el SDK.
- **SC-003**: El 100 % de los cambios de contrato sin regenerar el SDK hacen fallar la integración
  continua, verificado con un cambio de prueba.
- **SC-004**: En una prueba con una API local, el SDK hace exactamente las peticiones que pide la
  integración: cero peticiones adicionales.
- **SC-005**: Cero apariciones de la clave en los errores y sus representaciones en texto,
  verificado por pruebas automáticas.
- **SC-006**: Con reintentos activados, el número de peticiones nunca supera el máximo configurado,
  y ante `401` siempre es exactamente una.
- **SC-007**: El paquete compilado se instala en un proyecto vacío y funciona sin acceso al resto
  del monorepo.

## Assumptions

- **Alcance de las llamadas**: el SDK cubre las herramientas de `/v1` (las diez herramientas). El
  endpoint de métricas es de uso interno de la web y no tiene llamada en el SDK; el contrato
  (`openapi.json`) sigue disponible tal cual para quien lo necesite.
- **Entorno**: el SDK funciona en entornos de servidor con la API estándar de peticiones web (las
  versiones de Node que admite el proyecto y entornos compatibles). El navegador no es un objetivo.
- **Sin dependencias en tiempo de ejecución** salvo que el plan justifique alguna, para que
  instalarlo no traiga código ajeno a una integración.
- **Nombre y licencia**: el nombre previsto es `@urlkit/sdk` y la licencia la del proyecto; ambos
  se confirman en el plan y quedan preparados, pero la publicación queda fuera.
- **Espera máxima por defecto** de los reintentos y número de intentos por defecto: se fijan en el
  plan, con valores conservadores.
- **Validación en tiempo de ejecución**: el SDK confía en que la API cumple su contrato; no valida
  cada respuesta. Una respuesta que no es del contrato se trata como error de transporte (FR-013).
