# Feature Specification: Versión 2 de URLkit — análisis técnico avanzado (HTTP Headers, Metadata, TLS, DNS y Security Analysis)

**Feature Branch**: `002-v2-network-analysis`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "revisa lo que tenemos para la fase v2 y con qué empezaríamos". El
alcance procede de la hoja de ruta de `specs/001-mvp-url-toolkit/spec.md` ("Versión 2 — análisis
técnico avanzado, gratuito con límites razonables: DNS, SSL/TLS, cabeceras HTTP, metadatos de la
página y Security Analysis") y de `docs/arquitectura.md`, secciones 2 y 11.

## Alcance de esta especificación

Cubre **solo la versión 2**: cinco herramientas que, a diferencia de las del MVP, necesitan
consultar la red desde el servidor. Siguen siendo gratuitas, sin cuenta y sin publicidad, con
límites de uso por visitante anónimo. Las funciones de la versión 3 (reputación, lotes, informes,
historial, claves de API y planes de pago) quedan fuera.

**Orden de entrega**: las historias están ordenadas por el orden en que conviene construirlas.
Se empieza por **HTTP Headers** porque reutiliza la conexión saliente segura que ya existe para
Redirect Inspector, no exige ninguna pieza nueva de infraestructura y produce la primera entrada
de Security Analysis. DNS y TLS van después porque son las que deciden si hace falta un servicio
de sondas aparte (`docs/arquitectura.md`, sección 11); esa decisión se toma en el plan con una
comparación concreta, no aquí. Security Analysis va al final porque agrega a las demás.

Esta versión del producto **no cambia la versión de la API**: las herramientas nuevas se añaden a
la API pública existente sin romper nada de lo publicado.

## Clarifications

### Session 2026-11-10

- Q: ¿Security Analysis da una valoración global o solo hallazgos? → A: Solo una lista de
  hallazgos ordenados por gravedad, sin nota, puntuación ni veredicto global.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver las cabeceras HTTP de una página (HTTP Headers) (Priority: P1)

Una persona técnica (desarrollo, operaciones, SEO) quiere ver qué responde un servidor para una URL
sin abrir herramientas de desarrollo ni la línea de comandos. Pega la URL y ve el código de estado,
todas las cabeceras de la respuesta final y una evaluación de las cabeceras de seguridad: cuáles
están presentes, cuáles faltan y cuáles están mal configuradas, cada una con una explicación breve.

**Why this priority**: es la herramienta de red más barata de construir (reutiliza la conexión
segura del inspector), muy demandada por perfiles técnicos y la que aporta la primera mitad de las
señales de Security Analysis.

**Independent Test**: analizar una página conocida y comprobar que el estado y las cabeceras
coinciden con los que devuelve el servidor, y que la evaluación de seguridad marca correctamente
una cabecera ausente y una presente.

**Acceptance Scenarios**:

1. **Given** una URL `https` que responde 200, **When** se analiza, **Then** se muestran el código
   de estado, todas las cabeceras de la respuesta en el orden recibido y la evaluación de cabeceras
   de seguridad con su estado (presente, ausente, mal configurada) y su explicación.
2. **Given** una URL que redirige, **When** se analiza, **Then** se siguen las redirecciones con
   las mismas reglas que Redirect Inspector, se indica cuántos saltos hubo y qué URL final se
   analizó, y se ofrece abrir la cadena completa en Redirect Inspector.
3. **Given** una respuesta con cabeceras repetidas (p. ej. varias `Set-Cookie`), **When** se
   muestra, **Then** cada aparición se ve por separado y los valores de cookies se muestran sin
   almacenarse.
4. **Given** una URL que apunta a una dirección interna, privada o de metadatos, **When** se
   analiza, **Then** la petición se bloquea y se explica el motivo, igual que en Redirect Inspector.
5. **Given** una persona que supera el límite gratuito de la herramienta, **When** intenta otro
   análisis, **Then** se le informa del límite y de cuándo podrá volver, sin bloquear las demás.

---

### User Story 2 - Ver cómo se verá un enlace al compartirlo (Metadata) (Priority: P2)

Una persona que publica contenido (marketing, comunicación, desarrollo web) quiere saber qué
título, descripción e imagen mostrarán redes sociales y mensajería al compartir su enlace. Pega la
URL y ve los metadatos de la página agrupados por origen (básicos, Open Graph, tarjetas de redes,
URL canónica, idioma) y avisos de lo que falta o es incoherente.

**Why this priority**: muy demandada por un público no solo técnico y comparte casi todo el camino
técnico con HTTP Headers (misma petición segura, más lectura del documento).

**Independent Test**: analizar una página con metadatos Open Graph conocidos y comprobar que
título, descripción, imagen y URL canónica coinciden con los del documento.

**Acceptance Scenarios**:

1. **Given** una página HTML con título, descripción y etiquetas Open Graph, **When** se analiza,
   **Then** se muestran agrupados por origen, con el valor efectivo que usaría una vista previa.
2. **Given** una página sin imagen de vista previa o con la URL canónica apuntando a otro dominio,
   **When** se analiza, **Then** se muestra un aviso que explica la consecuencia.
3. **Given** metadatos que contienen marcado o esquemas peligrosos, **When** se muestran, **Then**
   aparecen como texto escapado y ningún `javascript:` ni `data:` se convierte en enlace activo.
4. **Given** una imagen de vista previa declarada, **When** se muestra el resultado, **Then** su
   URL aparece como texto y el navegador de la persona no la descarga automáticamente.
5. **Given** una respuesta que no es HTML, **When** se analiza, **Then** se informa del tipo de
   contenido recibido y de que no hay metadatos que extraer.

---

### User Story 3 - Revisar el certificado de un sitio (TLS) (Priority: P3)

Una persona técnica quiere comprobar el certificado y la conexión segura de un sitio: quién lo
emite, para qué nombres vale, cuándo caduca, si la cadena es de confianza y qué versión del
protocolo negocia. Pega una URL o un nombre de host y ve la cadena completa con avisos claros.

**Why this priority**: valor alto para perfiles técnicos y señal importante para Security
Analysis; es una de las dos herramientas que deciden si hace falta un servicio de sondas aparte.

**Independent Test**: analizar un host con certificado válido y otro con certificado caducado de
un entorno de prueba, y comprobar que el primero aparece válido y el segundo caducado con su fecha.

**Acceptance Scenarios**:

1. **Given** un host con certificado válido, **When** se analiza, **Then** se muestran la cadena
   (hoja, intermedios, raíz), emisor, nombres cubiertos, fechas de validez, días restantes, versión
   del protocolo negociada y estado de confianza.
2. **Given** un certificado caducado, autofirmado, de otro nombre o con cadena incompleta, **When**
   se analiza, **Then** el análisis no se interrumpe: se muestra el certificado recibido y cada
   problema se señala con su explicación.
3. **Given** un certificado que caduca en menos de 30 días, **When** se analiza, **Then** se avisa
   de la caducidad próxima.
4. **Given** un host cuyo nombre resuelve a una dirección interna o privada, **When** se analiza,
   **Then** la conexión se bloquea y se explica el motivo.

---

### User Story 4 - Consultar el DNS de un dominio (DNS) (Priority: P4)

Una persona técnica quiere ver los registros DNS de un dominio (direcciones, alias, correo,
servidores de nombres, texto y autoridades de certificación permitidas) y saber si el dominio está
firmado con DNSSEC. Pega una URL o un dominio y ve los registros agrupados por tipo, con su
duración en caché.

**Why this priority**: completa el análisis técnico y aporta señales de configuración (correo,
DNSSEC, autoridades de certificación) a Security Analysis; es la otra herramienta que decide si
hace falta un servicio de sondas aparte.

**Independent Test**: consultar un dominio con registros conocidos y comprobar que los tipos y
valores coinciden con los publicados, y que su estado DNSSEC es el esperado.

**Acceptance Scenarios**:

1. **Given** un dominio con registros A, AAAA, MX, NS y TXT, **When** se consulta, **Then** se
   muestran agrupados por tipo, con valor y duración en caché.
2. **Given** una URL completa, **When** se consulta, **Then** se usa su host y se indica también el
   dominio registrable, ofreciendo consultar cualquiera de los dos.
3. **Given** un dominio firmado con DNSSEC y otro sin firmar, **When** se consultan, **Then** se
   indica el estado de cada uno (validado, sin firmar o firma inválida).
4. **Given** un dominio que no existe, **When** se consulta, **Then** se informa de que no existe,
   distinguiéndolo de un fallo de consulta.
5. **Given** un dominio internacionalizado, **When** se consulta, **Then** se muestra en Unicode y
   en su forma ASCII.

---

### User Story 5 - Obtener una revisión de seguridad de un enlace (Security Analysis) (Priority: P5)

Una persona quiere una vista única de los aspectos técnicos de seguridad de un enlace sin tener que
pasar por cada herramienta. Pega la URL y obtiene, en una sola página, las señales de la URL (las de
Explain URL), la cadena de redirecciones, las cabeceras de seguridad, el certificado y la
configuración DNS relevante, ordenadas por gravedad y con un enlace a la herramienta que da el
detalle. No da nota ni veredicto global: sin servicios de reputación (v3), decir "seguro" podría
inducir a error.

**Why this priority**: es la herramienta que más valor percibido tiene para personas no técnicas,
pero depende de que existan las cuatro anteriores, así que se construye la última.

**Independent Test**: analizar un enlace de prueba con problemas conocidos (redirección de `https`
a `http`, cabecera de seguridad ausente, certificado próximo a caducar) y comprobar que los tres
aparecen, ordenados por gravedad y enlazados a su herramienta.

**Acceptance Scenarios**:

1. **Given** una URL, **When** se analiza, **Then** se muestran los hallazgos de todas las
   comprobaciones, ordenados por gravedad, cada uno con su explicación y su herramienta de detalle.
2. **Given** que una de las comprobaciones falla o agota su tiempo, **When** se muestra el
   resultado, **Then** aparece el resto y se indica qué parte no se pudo completar y por qué.
3. **Given** cualquier resultado, **When** se muestra, **Then** el texto deja claro qué se ha
   comprobado y qué no (en particular, que no se consultan listas de reputación).
4. **Given** una URL con destino interno o privado, **When** se analiza, **Then** se bloquean
   todas las comprobaciones de red y se muestran solo las señales de la URL.

---

### Edge Cases

- URL con esquema distinto de `http`/`https` o sin host: se rechaza con el error de entrada que ya
  usan las herramientas del MVP; DNS y TLS aceptan además un nombre de host suelto.
- Host que es una dirección IP literal: DNS informa de que no hay nombre que consultar; TLS se
  conecta sin nombre de servidor y lo indica; las direcciones no públicas se bloquean.
- Sitio que solo sirve `http`: TLS informa de que no hay conexión segura en el puerto 443; HTTP
  Headers y Security Analysis lo señalan como hallazgo.
- Puerto no estándar en la URL: se respeta para HTTP y TLS dentro de los puertos que ya permite
  Redirect Inspector; los demás se bloquean con motivo.
- Respuesta enorme o que nunca termina: se lee como máximo el tamaño fijado y se corta por tiempo;
  Metadata analiza lo leído e indica que el documento se truncó.
- Documento con codificación de caracteres no declarada o errónea: se informa y se muestra lo que
  se pudo decodificar.
- Servidor que responde distinto según el agente de usuario: se indica con qué agente de usuario se
  hizo la petición.
- Dominio con decenas de registros TXT o respuestas DNS grandes: se muestran todos los recibidos.
- Dominio que resuelve a direcciones privadas: DNS las muestra (es información pública y no
  implica conexión), pero las herramientas que conectan se bloquean.
- Caída del servidor de análisis: las cuatro herramientas locales del MVP siguen funcionando; las
  de red muestran un error de servicio no disponible.

## Requirements *(mandatory)*

### Functional Requirements

**Comunes a las cinco herramientas**

- **FR-001**: Las cinco herramientas MUST poder usarse sin crear cuenta ni iniciar sesión, y sin
  publicidad.
- **FR-002**: Las URLs, dominios y resultados MUST NOT almacenarse ni registrarse en claro en el
  servidor; como máximo, las trazas llevan el dominio registrable.
- **FR-003**: Toda conexión saliente MUST aplicar la misma protección completa que Redirect
  Inspector: resolver el nombre, validar todas las direcciones, conectar a la dirección validada,
  revalidar en cada salto y bloquear direcciones privadas, de loopback, link-local y de metadatos.
  La protección MUST superar el conjunto común de vectores de prueba.
- **FR-004**: Toda consulta de red MUST tener un tiempo de espera y un tamaño máximo de respuesta, y
  MUST informar a la persona cuando se alcanza cualquiera de los dos.
- **FR-005**: Cada herramienta MUST tener su propio límite de uso gratuito por visitante anónimo,
  identificado igual que en el MVP (IP seudonimizada con clave diaria, sin cookies). Superar el
  límite de una herramienta MUST NOT bloquear las demás.
- **FR-006**: Las cinco herramientas MUST estar disponibles en la API pública existente como
  ampliación compatible, sin publicar una versión nueva de la API ni cambiar las respuestas de las
  herramientas del MVP.
- **FR-007**: Los resultados MUST expresarse como códigos estables con parámetros; los textos para
  personas MUST existir en español e inglés.
- **FR-008**: Toda herramienta MUST ofrecer acciones "Enviar a" las demás herramientas, del MVP y de
  esta versión.
- **FR-009**: Todo valor recibido de un servidor externo MUST mostrarse escapado; esquemas
  peligrosos MUST NOT convertirse en enlaces activos, y el navegador de la persona MUST NOT
  descargar automáticamente recursos de terceros que aparezcan en un resultado.
- **FR-010**: Las comprobaciones que dependan de criterios versionables (qué cabeceras son de
  seguridad y cómo se evalúan, umbral de caducidad próxima, gravedades) MUST declarar la versión
  de los criterios aplicados en cada resultado.

**HTTP Headers**

- **FR-020**: MUST mostrar el código de estado y todas las cabeceras de la respuesta final, en el
  orden recibido y con las repeticiones por separado.
- **FR-021**: MUST seguir redirecciones con los mismos límites que Redirect Inspector e indicar el
  número de saltos y la URL final analizada.
- **FR-022**: MUST evaluar, como mínimo, `Strict-Transport-Security`, `Content-Security-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options` o `frame-ancestors`, `Referrer-Policy`,
  `Permissions-Policy` y los atributos de seguridad de las cookies, clasificando cada una como
  presente, ausente o mal configurada, con explicación.

**Metadata**

- **FR-030**: MUST extraer y agrupar por origen: título, descripción, URL canónica, idioma, icono,
  etiquetas Open Graph y etiquetas de tarjetas de redes sociales.
- **FR-031**: MUST indicar el valor efectivo que mostraría una vista previa cuando varias fuentes
  declaran el mismo dato.
- **FR-032**: MUST avisar, como mínimo, de: falta de título o de imagen de vista previa, URL
  canónica en otro dominio registrable, imagen de vista previa con URL no absoluta y documento
  truncado.
- **FR-033**: MUST NOT ejecutar scripts del documento analizado; los metadatos se extraen del
  marcado recibido.

**TLS**

- **FR-040**: MUST mostrar la cadena de certificados recibida con emisor, sujeto, nombres
  cubiertos, fechas de validez, días restantes, algoritmo de firma y versión del protocolo
  negociada.
- **FR-041**: MUST evaluar la confianza de la cadena y señalar por separado: caducado, aún no
  válido, autofirmado, nombre no coincidente, cadena incompleta y caducidad en menos de 30 días.
- **FR-042**: Un certificado no válido MUST NOT interrumpir el análisis: se muestra lo recibido y
  se señalan sus problemas.
- **FR-043**: MUST indicar si el certificado aporta pruebas de registro en transparencia de
  certificados.

**DNS**

- **FR-050**: MUST consultar, como mínimo, los tipos A, AAAA, CNAME, MX, NS, TXT, CAA y SOA, y
  mostrar cada registro con su valor y su duración en caché.
- **FR-051**: MUST indicar el estado DNSSEC del dominio: validado, sin firmar o firma inválida.
- **FR-052**: MUST distinguir "el dominio no existe", "no hay registros de ese tipo" y "la consulta
  falló".
- **FR-053**: MUST consultar a través de resolutores elegidos por el producto; la persona MUST NOT
  poder indicar un resolutor propio.
- **FR-054**: MUST aceptar una URL o un nombre de host, mostrar el nombre en Unicode y en ASCII, y
  ofrecer consultar el host o su dominio registrable.

**Security Analysis**

- **FR-060**: MUST agrupar en una sola vista los hallazgos de Explain URL, Redirect Inspector, HTTP
  Headers, TLS y DNS, ordenados por gravedad, cada uno enlazado a su herramienta de detalle.
- **FR-061**: Los hallazgos MUST generarse solo con reglas deterministas, sin modelos de IA: la
  misma situación produce el mismo resultado.
- **FR-062**: MUST mostrar resultados parciales cuando alguna comprobación falla, indicando cuál y
  por qué.
- **FR-063**: MUST declarar qué se ha comprobado y qué no, incluyendo que no se consultan servicios
  de reputación.
- **FR-064**: El resultado MUST ser una lista de hallazgos ordenados por gravedad, sin nota,
  puntuación ni veredicto global (ni de conjunto ni por categoría). Los hallazgos son avisos
  informativos, en la línea de FR-054 del MVP.
- **FR-065**: Un análisis de Security Analysis MUST contar como un único uso de su propio límite,
  aunque ejecute varias comprobaciones.

### Key Entities

- **Análisis de cabeceras**: URL final analizada, número de saltos, código de estado, lista
  ordenada de cabeceras y evaluación de cada cabecera de seguridad (estado, explicación, versión
  de los criterios).
- **Metadatos de página**: valores por origen (básicos, Open Graph, tarjetas), valor efectivo por
  dato, avisos e indicador de truncado.
- **Análisis TLS**: versión del protocolo, cadena de certificados (cada uno con emisor, sujeto,
  nombres, fechas, algoritmo), estado de confianza y problemas detectados.
- **Consulta DNS**: nombre consultado (Unicode y ASCII), registros por tipo con valor y duración
  en caché, estado DNSSEC y resultado de la consulta (existe, no existe, fallo).
- **Hallazgo**: código estable, gravedad, parámetros, herramienta de origen y enlace al detalle.
- **Revisión de seguridad**: lista de hallazgos, comprobaciones completadas y fallidas, alcance
  declarado y versión de los criterios.
- **Cuota de uso**: la misma entidad del MVP, con un contador por herramienta nueva.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 95 % de los análisis de HTTP Headers, Metadata, TLS y DNS terminan en menos de
  5 segundos; el 95 % de los de Security Analysis, en menos de 10 segundos.
- **SC-002**: El 100 % de los intentos de conectar con destinos internos o privados se bloquean en
  las pruebas de seguridad, en las cinco herramientas.
- **SC-003**: En un conjunto de al menos 50 sitios de referencia, el estado y las cabeceras
  mostrados coinciden con los del servidor en el 100 % de los casos, y la evaluación de cabeceras
  de seguridad coincide con la revisión manual en el 95 % o más.
- **SC-004**: En un conjunto de al menos 50 páginas con metadatos conocidos, título, descripción,
  imagen y URL canónica se extraen correctamente en el 95 % o más.
- **SC-005**: En un conjunto de hosts de prueba con certificados caducados, autofirmados, de otro
  nombre y con cadena incompleta, el 100 % de los problemas se detectan y se nombran.
- **SC-006**: En un conjunto de dominios de prueba firmados y sin firmar, el estado DNSSEC
  mostrado es correcto en el 100 % de los casos.
- **SC-007**: El 90 % de participantes no técnicos en una prueba de usabilidad identifican, tras
  usar Security Analysis, el problema más grave de un enlace de prueba y entienden qué no se ha
  comprobado.
- **SC-008**: Las cinco herramientas son utilizables con teclado y desde 320 px de ancho, y superan
  una auditoría de accesibilidad de nivel AA sin errores críticos.
- **SC-009**: Cero URLs, dominios completos o direcciones IP de visitantes en registros, trazas o
  informes de error, verificado por pruebas automáticas.

## Assumptions

- **Requisito previo**: la v2 se implementa sobre el MVP desplegado. A fecha de esta spec quedan
  abiertas T103 (prueba de usabilidad) y T111–T114 (despliegue) de la feature 001; conviene
  cerrarlas antes de empezar la implementación, para medir la v2 con tráfico y costes reales.
- Límites gratuitos: cada herramienta nueva arranca con los mismos límites que Redirect Inspector
  (10 usos por hora y 50 al día por visitante), elegidos de forma conservadora y ampliables cuando
  se conozca el coste real.
- No se guardan resultados en caché: guardar un resultado por URL equivale a almacenar la URL, que
  el Principio V prohíbe sin petición explícita.
- Si la v2 necesita un servicio de sondas aparte o se resuelve con la pila actual se decide en el
  plan, con la comparación que exige `docs/arquitectura.md`, sección 11. Esta spec no depende de
  esa decisión.
- Toda lógica de interpretación de URLs (host, dominio registrable, componentes) sigue viviendo en
  el núcleo existente; las herramientas de red reciben la URL ya analizada.
- Las peticiones HTTP se hacen sin cookies, sin credenciales y con un agente de usuario propio e
  identificable del producto.
- `docs/privacidad.md` ya anuncia que en la v2 el dominio analizado llegará al servidor; se
  actualiza junto con la implementación para describir cada herramienta nueva.
- Fuera de alcance: servicios de reputación y listas de bloqueo, análisis por lotes, informes,
  historial, cuentas y claves de API (v3); capturas de pantalla de la página; resolutores DNS
  elegidos por la persona; escaneo de puertos.
