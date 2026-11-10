# Feature Specification: MVP de URLkit — Smart Cleaner, URL Parser, Redirect Inspector, URL Diff y Explain URL

**Feature Branch**: `001-mvp-url-toolkit`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "por etapas y funcionalidad: MVP: Smart Cleaner, URL Parser, Redirect Inspector, URL Diff y Explain URL. Versión 2: DNS, SSL, HTTP Headers, Metadata y Security Analysis. Versión 3: Reputation APIs, Batch Analysis, Reports, History y API pública. Modelo de producto: modelo gratuito bastante generoso: limpieza e inspección básica sin cuenta; análisis técnico avanzado gratuito con límites razonables; historial e informes personales opcionales; API gratuita con cuota limitada; API de pago para procesamiento masivo y automatización. No pondría publicidad ni obligaría a registrarse para utilizar el limpiador."

## Alcance de esta especificación

Esta especificación cubre **solo el MVP**: cinco herramientas web de uso libre, sin cuenta y sin
publicidad. Las versiones 2 y 3 se registran en "Hoja de ruta (fuera de alcance)" para orientar
decisiones del MVP, pero cada una tendrá su propia especificación.

## Clarifications

### Session 2026-11-06

- Q: ¿Qué tan agresivo debe ser Smart Cleaner por defecto? → A: Seguro por defecto (solo
  seguimiento catalogado y envoltorios); "limpieza máxima" (reglas por sitio y formas canónicas)
  como opción activable con vista previa de los cambios.
- Q: ¿Cómo debe generar Explain URL sus explicaciones? → A: Solo reglas fijas, sin IA; se
  ejecuta en el navegador.
- Q: ¿Qué límite gratuito sin cuenta debe tener Redirect Inspector? → A: 10 inspecciones por hora
  y 50 al día por visitante.
- Q: ¿Cómo se identifica a un visitante anónimo para aplicar los límites? → A: IP seudonimizada
  (hash con clave que rota a diario), conservada solo durante la ventana del contador; sin cookies.
- Q: ¿Qué medición de uso se permite en el MVP? → A: Solo contadores agregados y anónimos (usos
  por herramienta, errores, tiempos de respuesta), sin cookies ni identificadores; sin banner de
  consentimiento.
- Q: ¿Cómo debe seguir Redirect Inspector las páginas intermedias de salida (avisos "vas a salir
  de…") que no redirigen solas? → A: Solo sigue el enlace de salida cuando coincide con el destino
  que la propia URL de la página nombra en un parámetro (criterio genérico, no por sitio); si no
  hay coincidencia, informa sin seguir. Nunca ejecuta JavaScript.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Limpiar una URL antes de compartirla (Smart Cleaner) (Priority: P1)

Una persona copia un enlace de una tienda, red social, newsletter o buscador. El enlace está
lleno de parámetros de seguimiento (`utm_*`, `fbclid`, `gclid`, etc.) o envuelto en una URL de
redirección (por ejemplo, la de un buscador o un servicio de "enlaces seguros" del correo). La
persona pega el enlace y obtiene al instante una versión limpia y equivalente, lista para copiar.
Ve qué se ha eliminado y por qué, y puede conservar cualquier parámetro concreto si lo necesita.

**Why this priority**: es la herramienta con más demanda y la puerta de entrada del producto.
Por sí sola ya es un producto útil y es la que el modelo de negocio exige ofrecer sin cuenta.

**Independent Test**: pegar URLs reales con seguimiento y comprobar que el resultado abre el
mismo contenido, sin parámetros de seguimiento, y que se copia con un clic.

**Acceptance Scenarios**:

1. **Given** una URL con `utm_source`, `utm_medium` y `fbclid`, **When** la persona la pega,
   **Then** el resultado conserva esquema, dominio, ruta y parámetros funcionales, elimina los
   de seguimiento y muestra la lista de parámetros eliminados con su motivo.
2. **Given** una URL envuelta en una redirección conocida (p. ej., `https://www.google.com/url?q=...`),
   **When** se limpia, **Then** el resultado es la URL de destino desenvuelta y ya limpia.
3. **Given** un resultado limpio, **When** la persona marca "conservar" en un parámetro eliminado,
   **Then** el resultado se recalcula incluyendo ese parámetro.
4. **Given** el enlace de producto de una tienda conocida, **When** se limpia en modo seguro,
   **Then** solo se quitan los parámetros de seguimiento; **When** la persona activa "limpieza
   máxima", **Then** ve una vista previa con la forma canónica más corta y los cambios añadidos.
5. **Given** una URL sin nada que limpiar, **When** se procesa, **Then** el sistema indica que
   la URL ya está limpia y la devuelve sin cambios.
6. **Given** una persona sin cuenta, **When** usa el limpiador cualquier número de veces,
   **Then** nunca se le pide registrarse ni se le muestra publicidad.

---

### User Story 2 - Entender la estructura de una URL (URL Parser) (Priority: P2)

Un desarrollador, analista de marketing o técnico de soporte pega una URL y ve sus componentes
por separado: esquema, usuario/contraseña, host (y su forma Unicode/Punycode), puerto, ruta y
segmentos, parámetros de consulta (decodificados, en tabla) y fragmento. Puede editar cualquier
componente o parámetro y ver la URL reconstruida al momento.

**Why this priority**: es la base técnica de las demás herramientas y un uso diario muy
frecuente para perfiles técnicos.

**Independent Test**: pegar URLs con IDN, codificación porcentual, parámetros repetidos y
fragmento; verificar que cada componente se muestra correctamente y que editar y reconstruir
produce una URL válida.

**Acceptance Scenarios**:

1. **Given** `https://usuario@münchen.de:8080/a%20b/c?x=1&x=2&y=#sec`, **When** se analiza,
   **Then** se muestran el host en Unicode y en Punycode, el puerto 8080, la ruta decodificada,
   los dos valores de `x`, `y` vacío y el fragmento `sec`.
2. **Given** una URL analizada, **When** la persona edita el valor de un parámetro o añade uno
   nuevo, **Then** la URL reconstruida se actualiza al instante y está correctamente codificada.
3. **Given** un texto que no es una URL válida, **When** se analiza, **Then** se muestra un
   error que explica qué parte es inválida.

---

### User Story 3 - Ver adónde lleva realmente un enlace (Redirect Inspector) (Priority: P3)

Una persona recibe un enlace acortado o sospechoso y quiere saber adónde lleva sin abrirlo en su
navegador. Pega el enlace y ve la cadena completa de redirecciones: cada salto con su URL, código
de estado, tipo de redirección y tiempo, hasta el destino final.

**Why this priority**: aporta valor de seguridad y transparencia; requiere peticiones desde el
servidor, por lo que tiene límites de uso y más complejidad que las anteriores.

**Independent Test**: inspeccionar un enlace acortado conocido y comprobar que la cadena y el
destino coinciden con los reales, sin que el navegador de la persona visite ningún salto.

**Acceptance Scenarios**:

1. **Given** un enlace acortado que hace dos redirecciones, **When** se inspecciona, **Then** se
   muestran los tres pasos (origen, intermedio, destino) con código de estado y duración, y el
   destino final se puede copiar o limpiar con Smart Cleaner con un clic.
2. **Given** una cadena que supera el máximo de saltos o forma un bucle, **When** se inspecciona,
   **Then** se detiene y se informa del bucle o del límite alcanzado, mostrando los saltos vistos.
3. **Given** un enlace que apunta a una dirección interna, privada o de metadatos, **When** se
   inspecciona, **Then** la petición se bloquea y se explica el motivo.
4. **Given** una persona sin cuenta que supera el límite gratuito, **When** intenta otra
   inspección, **Then** se le informa del límite y de cuándo podrá volver a usarla, sin bloquear
   el resto de herramientas.
5. **Given** un enlace a una página intermedia de salida (p. ej. `linkedin.com/safety/go/?url=…`)
   que no redirige sola pero enlaza al destino que nombra su parámetro `url`, **When** se
   inspecciona, **Then** se muestran dos pasos (la página intermedia, de tipo intersticial, y el
   destino) y el destino final es la URL del parámetro, aunque responda 410.

---

### User Story 4 - Comparar dos URLs (URL Diff) (Priority: P4)

Una persona tiene dos URLs que parecen iguales (p. ej., dos enlaces de campaña o un enlace antes
y después de un cambio) y quiere saber exactamente en qué difieren. Las pega y ve las diferencias
por componente y por parámetro: añadidos, eliminados y modificados, con opción de ignorar el
orden de los parámetros, mayúsculas del host o parámetros de seguimiento.

**Why this priority**: muy útil para marketing, QA y SEO, pero lo usa un público más pequeño.

**Independent Test**: comparar pares de URLs con diferencias conocidas y verificar que el
resultado las enumera todas y nada más.

**Acceptance Scenarios**:

1. **Given** dos URLs que solo difieren en el valor de `utm_campaign` y el orden de dos
   parámetros, **When** se comparan con "ignorar orden" activado, **Then** solo se informa la
   diferencia de `utm_campaign`.
2. **Given** dos URLs equivalentes tras normalizar (mayúsculas del host, puerto por defecto,
   codificación equivalente), **When** se comparan, **Then** se indica que son equivalentes y se
   listan las diferencias puramente cosméticas.

---

### User Story 5 - Explicar una URL en lenguaje sencillo (Explain URL) (Priority: P5)

Una persona no técnica pega una URL y recibe una explicación clara de qué es cada parte y para
qué sirve: qué sitio es el dominio real, qué parámetros son de seguimiento y de qué plataforma,
cuáles parecen funcionales y qué señales llaman la atención (dominio que imita a otro, credenciales
incrustadas, uso de dirección IP, codificación excesiva, esquemas peligrosos).

**Why this priority**: diferencia el producto y amplía el público, pero depende de que el
analizador y el catálogo de parámetros del limpiador ya existan.

**Independent Test**: pegar URLs de ejemplo (de campaña, con IDN engañoso, con credenciales) y
comprobar que la explicación identifica cada parte y cada señal relevante en lenguaje sencillo.

**Acceptance Scenarios**:

1. **Given** una URL de campaña, **When** se explica, **Then** se identifica el dominio registrable
   real y cada parámetro de seguimiento con la plataforma a la que pertenece.
2. **Given** `https://paypal.com@ejemplo-malo.xyz/login`, **When** se explica, **Then** se avisa de
   que el sitio real es `ejemplo-malo.xyz` y de que lo anterior a `@` no es el destino.
3. **Given** un dominio con caracteres que imitan otro (homógrafo), **When** se explica, **Then**
   se muestra su forma Punycode y una advertencia.

---

### User Story 6 - Moverse entre herramientas sin fricción (Priority: P6)

Una persona usa una herramienta y quiere pasar el resultado a otra (p. ej., analizar el destino
final del inspector o explicar una URL ya limpia) sin volver a pegarla. Todas las herramientas
comparten un aspecto coherente, se pueden enlazar con la URL ya cargada y funcionan en móvil.

**Why this priority**: convierte cinco herramientas sueltas en una "navaja suiza"; no aporta
valor sin las anteriores.

**Independent Test**: recorrer un flujo limpiar → explicar → inspeccionar usando solo los botones
de "enviar a" y comprobar que la URL se conserva en cada paso.

**Acceptance Scenarios**:

1. **Given** un resultado en cualquier herramienta, **When** la persona pulsa "Enviar a <herramienta>",
   **Then** se abre esa herramienta con la URL ya cargada y procesada.
2. **Given** un enlace compartible de una herramienta con una URL cargada, **When** otra persona
   lo abre, **Then** ve la misma herramienta con la misma entrada, sin necesidad de cuenta.

---

### Edge Cases

- URLs sin esquema (`ejemplo.com/ruta`): se interpretan como `https://` y se avisa de ello.
- URLs de longitud extrema (más de 8.000 caracteres): se procesan hasta un máximo documentado
  (32.000 caracteres) y por encima se rechazan con un mensaje claro.
- Texto pegado con espacios, saltos de línea o varias URLs: se recortan espacios; si hay varias
  URLs, se procesa la primera y se avisa (el procesamiento por lotes es de la versión 3).
- Esquemas no web (`mailto:`, `tel:`, `javascript:`, `data:`, `file:`): el analizador y el
  explicador los muestran; el limpiador solo limpia `http(s)`; los peligrosos nunca se muestran
  como enlaces activos.
- Parámetros con el mismo nombre repetido, sin valor o con codificación inválida.
- Dominios internacionalizados, homógrafos y direcciones IPv4/IPv6 (incluidas formas numéricas
  poco habituales).
- Redirect Inspector: tiempos de espera, certificados inválidos, respuestas enormes, redirecciones
  por `meta refresh` o JavaScript (estas últimas se detectan y se informan pero no se ejecutan),
  páginas intermedias de salida con un enlace que hay que pulsar (FR-037; sin ese enlace
  coincidente, se informa sin seguir nada), destinos que requieren autenticación o devuelven
  errores 4xx/5xx.
- Envoltorios de redirección anidados (una URL envuelta dentro de otra).
- Parámetros que parecen de seguimiento pero son funcionales en un sitio concreto (p. ej., `ref`
  en algunas tiendas): el limpiador respeta reglas específicas por dominio y permite conservarlos.
- Redes compartidas (oficinas, universidades, operadores con IP compartida): varias personas
  comparten el límite de Redirect Inspector; el mensaje de límite lo explica y el resto de
  herramientas sigue disponible.

## Requirements *(mandatory)*

### Functional Requirements

**Generales**

- **FR-001**: Las cinco herramientas del MVP MUST poder usarse sin crear cuenta ni iniciar sesión.
- **FR-002**: El producto MUST NOT mostrar publicidad de ningún tipo.
- **FR-003**: Toda herramienta MUST aceptar la URL pegada, escrita o recibida mediante enlace
  compartible, y MUST ofrecer copiar el resultado con un clic.
- **FR-004**: Toda herramienta MUST ofrecer acciones "Enviar a" las demás herramientas del MVP.
- **FR-005**: Las URLs introducidas MUST NOT almacenarse ni registrarse en claro en el servidor.
  La única medición permitida son contadores agregados y anónimos (usos por herramienta, errores,
  tiempos de respuesta), sin cookies, identificadores de visitante ni servicios de analítica de
  terceros, de modo que no se requiere banner de consentimiento.
- **FR-006**: Smart Cleaner, URL Parser, URL Diff y Explain URL MUST funcionar sin enviar la URL
  al servidor. Solo Redirect Inspector puede hacer peticiones desde el servidor.
- **FR-007**: La interfaz MUST estar disponible en español e inglés, detectar el idioma del
  navegador y permitir cambiarlo.
- **FR-008**: Ante una entrada inválida, toda herramienta MUST mostrar un error que identifique
  la parte problemática; nunca un resultado silenciosamente incorrecto.
- **FR-009**: Las cinco herramientas MUST estar disponibles mediante una API pública, versionada y
  documentada, anónima en el MVP y con los límites indicados en Assumptions. La web MUST NOT
  usarla para las herramientas locales (FR-006).

**Smart Cleaner**

- **FR-010**: MUST eliminar parámetros de seguimiento según un catálogo mantenido (como mínimo:
  `utm_*`, `fbclid`, `gclid`, `dclid`, `gbraid`, `wbraid`, `msclkid`, `mc_cid`, `mc_eid`,
  `igshid`, `yclid`, `_hsenc`, `_hsmi`, `mkt_tok`, `twclid`, `ttclid`, `si` en dominios conocidos).
- **FR-011**: MUST desenvolver URLs de redirección conocidas (buscadores, redes sociales,
  servicios de "enlaces seguros" de correo), incluidos envoltorios anidados.
- **FR-012**: El modo por defecto MUST ser "seguro": solo aplica FR-010 y FR-011. Un modo
  "limpieza máxima", activable por la persona, MUST aplicar además reglas específicas por dominio
  (p. ej., reducir enlaces de producto a su forma canónica en tiendas conocidas) sin cambiar el
  contenido al que lleva, mostrando una vista previa de los cambios adicionales. La elección de
  modo MUST recordarse solo en el navegador de la persona.
- **FR-013**: MUST conservar los parámetros no catalogados como seguimiento.
- **FR-014**: MUST mostrar cada elemento eliminado con su motivo y permitir conservarlo.
- **FR-015**: MUST ofrecer, como acción explícita, expandir un enlace acortado mediante
  Redirect Inspector y limpiar el destino.

**URL Parser**

- **FR-020**: MUST mostrar por separado esquema, usuario, contraseña (enmascarada por defecto),
  host en Unicode y Punycode, dominio registrable, subdominio, puerto (indicando si es el de
  defecto), ruta y segmentos, parámetros (tabla nombre/valor decodificados, en orden, con
  repetidos) y fragmento.
- **FR-021**: MUST permitir editar componentes y parámetros (añadir, quitar, reordenar) y
  reconstruir la URL con la codificación correcta.
- **FR-022**: MUST seguir las reglas de análisis del estándar de URLs que usan los navegadores e
  indicar cuando la interpretación de una URL pueda diferir entre implementaciones.

**Redirect Inspector**

- **FR-030**: MUST seguir la cadena de redirecciones desde el servidor y mostrar, para cada salto,
  URL, código de estado, tipo (permanente, temporal, `meta refresh`, detectada en JavaScript,
  intersticial según FR-037), duración y destino siguiente.
- **FR-031**: MUST detenerse ante bucles y al alcanzar un máximo de 20 saltos, informándolo.
- **FR-032**: MUST bloquear destinos en direcciones privadas, de loopback, link-local y de
  metadatos, también cuando se alcancen tras una redirección o resolución de nombre.
- **FR-033**: MUST aplicar un tiempo de espera por salto y un tamaño máximo de respuesta leída,
  y MUST NOT ejecutar JavaScript ni descargar recursos del destino.
- **FR-034**: MUST aplicar un límite de uso gratuito sin cuenta de 10 inspecciones por hora y
  50 al día por visitante, informando del límite y del tiempo restante.
- **FR-036**: El visitante anónimo MUST identificarse mediante su IP seudonimizada (hash con una
  clave que rota a diario), conservada solo durante la ventana del contador y nunca asociada a
  las URLs inspeccionadas; MUST NOT usarse cookies ni identificadores en el navegador para ello.
- **FR-035**: MUST indicar si un salto cambia de `https` a `http` o de dominio registrable.
- **FR-037**: Cuando una respuesta HTML 2xx no redirige sola (ni `meta refresh` ni redirección
  JavaScript literal), MUST seguir un enlace de salida de la página solo si su destino (URL
  absoluta `http` o `https`) es idéntico a una URL que la propia URL de la página nombra en un
  parámetro de consulta, decodificado. El criterio es genérico: MUST NOT depender de una lista
  de sitios. El salto MUST mostrarse con tipo `intersticial`. En cualquier otro caso MUST NOT
  seguir enlaces de la página. Cada salto de este tipo cuenta para el máximo de FR-031 y se
  valida como cualquier otro salto (FR-032, FR-033); el destino alcanzado es el destino final
  aunque responda con un error 4xx/5xx.

**URL Diff**

- **FR-040**: MUST comparar dos URLs por componente y por parámetro, clasificando cada diferencia
  como añadida, eliminada o modificada.
- **FR-041**: MUST ofrecer opciones de comparación: ignorar orden de parámetros, ignorar
  parámetros de seguimiento, normalizar (mayúsculas del host, puerto por defecto, codificación
  equivalente, barra final).
- **FR-042**: MUST indicar explícitamente cuando las URLs son equivalentes con las opciones
  elegidas.

**Explain URL**

- **FR-050**: MUST describir en lenguaje sencillo cada componente de la URL y su función.
- **FR-051**: MUST identificar el dominio registrable real y la plataforma de cada parámetro de
  seguimiento conocido.
- **FR-052**: MUST señalar como mínimo: credenciales incrustadas o texto engañoso antes de `@`,
  host como dirección IP, homógrafos/IDN mezclando alfabetos, codificación excesiva o doble,
  esquemas peligrosos, puertos inusuales, URLs anidadas y TLDs de uso frecuente en abuso.
- **FR-053**: Las explicaciones MUST generarse solo con reglas deterministas, sin modelos de IA
  (la misma URL produce la misma explicación), en el navegador y en ambos idiomas.
- **FR-054**: Las señales MUST presentarse como avisos informativos y no como un veredicto de
  seguridad (el análisis de seguridad completo es de la versión 2).

### Key Entities

- **URL analizada**: representación de una URL en sus componentes, con su forma original, su
  forma normalizada y los errores o avisos de análisis.
- **Regla de limpieza**: parámetro o patrón de seguimiento, envoltorio de redirección o regla
  específica de dominio; incluye ámbito (global o dominio), modo (seguro o "limpieza máxima"),
  motivo y plataforma asociada.
- **Resultado de limpieza**: URL de entrada, URL limpia y lista de elementos eliminados con motivo.
- **Cadena de redirecciones**: secuencia ordenada de saltos (URL, estado, tipo, duración) con el
  destino final y el motivo de parada (destino, bucle, límite, bloqueo, error).
- **Comparación**: par de URLs, opciones elegidas y lista de diferencias clasificadas.
- **Explicación**: lista de componentes explicados y lista de señales con severidad informativa.
- **Cuota de uso**: contador por visitante anónimo (IP seudonimizada con clave diaria) y
  herramienta, con ventana (hora y día) y límite; se descarta al vencer la ventana.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona que llega por primera vez obtiene una URL limpia y copiada en menos de
  10 segundos, sin registrarse.
- **SC-002**: En un conjunto de prueba de al menos 200 URLs reales con seguimiento, el limpiador
  elimina el 95 % o más de los parámetros de seguimiento y el 100 % de las URLs limpias siguen
  abriendo el mismo contenido.
- **SC-003**: Los resultados de las herramientas locales aparecen de forma instantánea para la
  persona (menos de 0,1 s tras pegar la URL).
- **SC-004**: El 95 % de las inspecciones de redirecciones de 5 saltos o menos terminan en menos
  de 5 segundos.
- **SC-005**: El 100 % de los intentos de inspeccionar destinos internos o privados se bloquean en
  las pruebas de seguridad.
- **SC-006**: En un conjunto de vectores de prueba de casos límite (IDN, codificación, IPs,
  parámetros repetidos), el analizador coincide con el estándar en el 100 % de los casos.
- **SC-007**: El 90 % de participantes no técnicos en una prueba de usabilidad identifican
  correctamente el dominio real de una URL engañosa usando Explain URL.
- **SC-008**: Todas las herramientas son utilizables con teclado y en pantallas desde 320 px de
  ancho, y superan una auditoría de accesibilidad de nivel AA sin errores críticos.
- **SC-009**: Cero anuncios y cero solicitudes de registro en todo el recorrido del MVP.

## Hoja de ruta (fuera de alcance)

Estas etapas se especificarán por separado. El MVP no las implementa, pero no debe impedirlas.

- **Versión 2 — análisis técnico avanzado** (gratuito con límites razonables): DNS, SSL/TLS,
  cabeceras HTTP, metadatos de la página (título, Open Graph, etc.) y Security Analysis.
- **Versión 3 — plataforma**: integración con servicios de reputación, análisis por lotes,
  informes, historial personal opcional (requiere cuenta) y API pública con claves, cuotas por
  plan y API de pago.
- **Modelo de producto previsto**: limpieza e inspección básica sin cuenta; análisis avanzado
  gratuito con límites; historial e informes personales opcionales con cuenta; API gratuita con
  cuota limitada; API de pago para procesamiento masivo y automatización; sin publicidad.

## Assumptions

- El MVP no incluye cuentas, inicio de sesión, pagos ni historial; los límites de uso se aplican
  por visitante anónimo.
- El MVP publica una API `/v1` anónima y documentada para las cinco herramientas (Principio IV de
  la constitución), con limitación de tasa por visitante: Redirect Inspector 10/hora y 50/día;
  demás herramientas 600/hora; eventos de métricas 300/hora. La versión 3 añade claves de API,
  cuotas por plan y planes de pago sobre el mismo contrato, sin cambios incompatibles.
- "Inspección básica sin cuenta" en el MVP corresponde a Redirect Inspector con los límites de
  FR-034 (10/hora, 50/día), elegidos de forma conservadora; podrán ampliarse más adelante.
- Explain URL usa reglas deterministas, no modelos de IA, para garantizar coherencia, privacidad
  y coste cero por uso (confirmado en Clarifications).
- El catálogo de reglas de limpieza se mantiene en el propio producto y puede partir de listas
  públicas reconocidas de parámetros de seguimiento, respetando sus licencias.
- Idiomas iniciales: español e inglés, según la constitución del proyecto.
- El público incluye tanto personas no técnicas (limpiar, explicar) como perfiles técnicos
  (analizar, comparar, inspeccionar).
- Los enlaces compartibles contienen la URL en la propia dirección compartida, de forma que no
  llegue al servidor al abrirlos (FR-005); se avisa a la persona antes de copiarlo, porque quien
  lo reciba verá la URL.
