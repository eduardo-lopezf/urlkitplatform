<!--
Sync Impact Report
- Version change: 1.1.0 → 1.2.0
- Principios añadidos: ninguno
- Principios modificados:
  IV. API-first y escalabilidad SaaS → el contrato MUST declarar el esquema de autenticación y
      el sujeto de cuota desde su primera versión, aunque solo se use el plan anónimo
  V. Privacidad y seguridad por defecto → la protección SSRF MUST ser completa desde la primera
      versión que haga peticiones salientes, y MUST aplicarse igual en cualquier servicio y
      lenguaje, demostrado contra un conjunto de vectores compartido
- Secciones añadidas: ninguna
- Secciones eliminadas: ninguna
- Plantillas dependientes: no modificadas (leen la constitución en tiempo de ejecución)
- TODOs diferidos: ninguno
-->
# URLkit Platform Constitution

## Core Principles

### I. Herramientas modulares (navaja suiza)

URLkit es un conjunto de herramientas de manipulación de URLs (analizar, construir, codificar/
decodificar, normalizar, limpiar parámetros de seguimiento, editar query strings, validar,
comparar, etc.). Cada herramienta:

- MUST implementarse como un módulo independiente con una única responsabilidad clara.
- MUST separar el núcleo lógico (funciones puras, sin dependencias de UI, red ni base de datos)
  de sus adaptadores (interfaz web, API, CLI u otros).
- MUST registrarse mediante un mecanismo común (registro de herramientas) para que añadir una
  herramienta nueva no requiera modificar las existentes.
- MUST poder probarse y documentarse de forma aislada.

Razón: el valor del producto está en la colección; cada pieza debe poder crecer, sustituirse o
retirarse sin afectar a las demás.

### II. Corrección según estándares

- El análisis y la serialización de URLs MUST seguir el WHATWG URL Standard; cuando aplique,
  se MUST documentar la diferencia con RFC 3986.
- Las herramientas MUST manejar correctamente IDN/Punycode, codificación porcentual, Unicode,
  puertos, credenciales, fragmentos y parámetros repetidos o vacíos.
- Las transformaciones MUST ser deterministas; las que se declaren reversibles MUST superar
  pruebas de ida y vuelta (round-trip).
- Ante una entrada inválida, la herramienta MUST devolver un error explícito y comprensible,
  nunca un resultado silenciosamente incorrecto.

Razón: una herramienta de URLs que se equivoca en casos límite es peor que no tenerla.

### III. Minimalismo funcional en la interfaz

- Cada pantalla MUST resolver una tarea principal; la entrada y el resultado MUST ser visibles
  sin navegación adicional.
- Los elementos que no ayuden a completar la tarea (decoración, ventanas emergentes, pasos
  intermedios) MUST NOT añadirse sin una justificación documentada en la especificación.
- La interfaz MUST construirse sobre un sistema de diseño único (tokens de color, tipografía,
  espaciado y componentes reutilizables) para que nuevas herramientas hereden el mismo aspecto.
- La interfaz MUST cumplir WCAG 2.2 nivel AA, funcionar con teclado, ser responsive desde
  320 px de ancho y soportar modo claro y oscuro.
- Toda acción con resultado copiable MUST ofrecer copiar con un clic.

Razón: lo minimalista atrae; el sistema de diseño es lo que permite escalar sin perder coherencia.

### IV. API-first y escalabilidad SaaS

- Toda capacidad disponible en la interfaz web MUST estar disponible mediante una API pública,
  versionada y documentada (contrato OpenAPI o equivalente).
- Los cambios incompatibles en la API MUST publicarse en una nueva versión mayor; las versiones
  anteriores MUST mantenerse durante un periodo de deprecación anunciado.
- Los servicios MUST ser sin estado (stateless) para poder escalar horizontalmente.
- El diseño MUST contemplar desde el inicio multi-tenencia (cuentas y organizaciones), claves
  de API, límites de uso por plan y medición del consumo, aunque las primeras versiones solo
  activen un plan gratuito.
- La lógica de planes y permisos MUST residir en una capa separada del núcleo de herramientas.
- El contrato público MUST declarar su esquema de autenticación desde la primera versión, aunque
  todos los endpoints lo acepten como opcional y solo exista el plan anónimo. Activar las claves
  MUST NOT ser un cambio incompatible.
- El sujeto de la cuota MUST modelarse desde el principio como un tipo discriminado capaz de
  representar visitante anónimo, clave de API y organización, y las cabeceras de límite de uso
  MUST ser las mismas para todos ellos. Las respuestas que dependan de datos versionados MUST
  declarar la versión aplicada, para que un informe almacenado en el futuro siga siendo
  reproducible.

Razón: pasar de herramienta gratuita a SaaS no debe exigir reescribir el producto.

### V. Privacidad y seguridad por defecto

- Las transformaciones que no requieran servidor MUST ejecutarse en el navegador del usuario.
- Las URLs y datos introducidos por usuarios MUST NOT almacenarse ni registrarse en logs en
  claro salvo que el usuario lo solicite explícitamente (p. ej., historial guardado).
- Cualquier herramienta que haga peticiones salientes (seguir redirecciones, expandir enlaces,
  comprobar estado) MUST protegerse contra SSRF: bloquear rangos privados, de loopback y de
  metadatos, limitar redirecciones, tiempos de espera y tamaño de respuesta.
- Esa protección MUST estar completa en la primera versión que haga peticiones salientes. No se
  entrega por partes ni se aplaza a versiones posteriores: una validación incompleta no reduce el
  riesgo, lo oculta.
- La validación MUST resolver el nombre, comprobar **todas** las IPs resueltas y conectar a la IP
  validada, repitiéndose en cada salto; el cliente HTTP MUST NOT seguir redirecciones por su
  cuenta ni honrar variables de entorno de proxy.
- Todo servicio que haga peticiones salientes MUST aplicar la misma validación, en cualquier
  lenguaje, y MUST demostrarlo contra un conjunto de vectores de prueba compartido, independiente
  del lenguaje. Es la única duplicación de lógica admitida en el producto, y por eso MUST estar
  cubierta por vectores comunes en lugar de por confianza.
- La restricción de salida a nivel de red (egress) MUST existir como segunda barrera; no sustituye
  a la validación en el cliente HTTP.
- Las salidas que se muestren en la interfaz MUST escaparse para evitar XSS; esquemas peligrosos
  (`javascript:`, `data:`) MUST NOT renderizarse como enlaces activos.
- Los endpoints públicos MUST aplicar limitación de tasa.

Razón: los usuarios confían URLs que pueden contener tokens y datos personales.

### VI. Calidad verificada con pruebas

- El núcleo de cada herramienta MUST desarrollarse con pruebas primero: se escriben pruebas con
  casos normales y límite, se comprueba que fallan y después se implementa.
- Cada herramienta MUST incluir vectores de prueba de casos límite (IDN, codificación, entradas
  malformadas, URLs muy largas).
- Los contratos de la API MUST tener pruebas de contrato; los flujos principales de la interfaz
  MUST tener pruebas de extremo a extremo.
- Ningún cambio se integra con pruebas fallando.

Razón: la corrección (Principio II) solo es creíble si está demostrada.

### VII. Simplicidad y crecimiento incremental

- Cada funcionalidad MUST empezar por la solución más simple que cumpla la especificación (YAGNI).
- Toda dependencia o capa de infraestructura nueva MUST justificarse en el plan de implementación.
- Las herramientas MUST entregarse una a una como incrementos utilizables; no se construye la
  plataforma completa antes de ofrecer la primera herramienta.

Razón: escalable no significa complejo desde el día uno; significa no cerrar puertas.

### VIII. Adaptadores delgados

La lógica de producto vive en el núcleo; los adaptadores solo la exponen.

- Un adaptador (API HTTP, interfaz web, CLI o cualquier otro) MUST limitar su responsabilidad a:
  recibir la solicitud, validar el contrato de entrada, resolver identidad y autenticación,
  aplicar cuotas y límites de uso, invocar el núcleo, serializar el resultado y traducir los
  errores del núcleo al protocolo correspondiente.
- Un adaptador MUST NOT contener reglas de producto. Decidir qué parámetro se elimina y por qué,
  cómo se normaliza un host, qué constituye un bucle de redirección o cómo se explica una señal
  son decisiones del núcleo, no del manejador de ruta.
- Toda regla de negocio nueva MUST implementarse en el núcleo o en un paquete de dominio con sus
  propias pruebas, nunca en el adaptador que la invoca.
- Un manejador de ruta MUST poder leerse de arriba abajo mostrando solo esa secuencia: validar,
  autorizar, medir, invocar, responder. Si contiene condicionales sobre el significado del dato,
  la lógica está mal ubicada.
- Un comportamiento que solo pueda probarse arrancando el adaptador MUST refactorizarse hasta
  ser probable como función pura del núcleo.

Razón: la API es la superficie que más cambia (versiones, autenticación, planes, cuotas) y la
que más difícil es de probar. Todo lo que se acumule en ella queda fuera del alcance de las
pruebas del núcleo y se convierte en lógica que no se puede reutilizar desde el navegador.

### IX. Fronteras explícitas entre servicios

El sistema usa más de un lenguaje de programación. Ningún tipo compartido puede sostenerse
sobre la disciplina de quien escribe el código.

- Cada frontera entre procesos MUST tener un contrato declarado, versionado y legible por
  máquina (OpenAPI para HTTP, JSON Schema para artefactos de datos, esquema SQL para la base
  de datos).
- Los tipos y clientes de consumo MUST generarse desde el contrato. MUST NOT mantenerse a mano
  dos definiciones del mismo tipo en dos lenguajes.
- Cada frontera MUST tener pruebas de contrato en ambos lados: el proveedor demuestra que sus
  respuestas cumplen el esquema y el consumidor demuestra que funciona contra él.
- Un servicio MUST NOT acceder al almacenamiento interno de otro ni a sus tablas; la única vía
  de acceso es su contrato publicado.
- Los cambios incompatibles en un contrato MUST publicarse como versión mayor y mantener la
  anterior durante un periodo de deprecación anunciado, igual que la API pública (Principio IV).
- Un contrato MUST declarar explícitamente sus modos de fallo: códigos de error, tiempos de
  espera y comportamiento esperado del consumidor cuando el proveedor no responde.

Razón: en un sistema de un solo lenguaje el compilador detecta una frontera rota; en uno
políglota, no la detecta nadie hasta producción.

### X. Datos declarativos versionados y compatibles

El catálogo de reglas de limpieza y el catálogo de mensajes son artefactos de contrato, no
ficheros de configuración.

- El catálogo de reglas MUST estar versionado con versionado semántico propio e independiente del
  código, validado por esquema en la integración continua.
- Cada regla MUST tener un identificador estable y un motivo asociado. Añadir reglas es un cambio
  MINOR; cambiar el significado de una regla existente, su identificador o su modo (`safe`/`max`),
  o eliminarla, es un cambio MAJOR.
- Toda respuesta que dependa del catálogo MUST indicar la versión aplicada, para que un resultado
  sea reproducible y auditable.
- Los códigos de mensaje MUST ser estables y formar parte del contrato público: un código
  publicado MUST NOT cambiar de significado ni desaparecer sin deprecación anunciada, porque los
  clientes de la API toman decisiones a partir de ellos.
- El núcleo MUST NOT contener texto destinado a personas. Devuelve códigos con parámetros; los
  textos viven en catálogos por idioma, separados del núcleo y con una prueba que exige el mismo
  conjunto de claves en todos los idiomas.
- Un texto MAY corregirse o reescribirse en cualquier momento sin cambio de versión; el código al
  que corresponde, no.

Razón: las reglas y los mensajes son la parte del producto que cambia a diario. Si cambian sin
disciplina de compatibilidad, cada actualización puede alterar en silencio el resultado que un
cliente ya integró o romper la rama de código que reacciona a un error concreto.

## Restricciones de producto y técnicas

- Presupuesto de rendimiento: carga inicial de una página de herramienta < 1 s en conexión 4G
  y JavaScript inicial < 150 KB comprimido; resultado de transformaciones locales < 100 ms.
- La API MUST responder en < 200 ms (p95) para transformaciones que no hagan peticiones salientes.
- La interfaz MUST prepararse para internacionalización (textos externalizados); idiomas
  iniciales: español e inglés.
- La pila tecnológica concreta se decide en cada plan de implementación (`/speckit-plan`) y
  MUST respetar estos principios; la elección se documenta con su justificación.
- La arquitectura por etapas y la pila vigente de todo el producto se mantienen en
  [`docs/arquitectura.md`](../../docs/arquitectura.md). Añadir un lenguaje o un servicio nuevo
  MUST justificarse allí con la frontera que introduce (Principio IX) y la funcionalidad que lo
  hace necesario; el Principio VII prohíbe añadirlo antes.
- Las métricas de producto MUST ser anónimas y agregadas, en línea con el Principio V.

## Flujo de desarrollo y puertas de calidad

- Cada funcionalidad sigue el flujo Spec Kit: especificación → (aclaración) → plan → tareas →
  implementación.
- Todo plan MUST incluir una "Comprobación de constitución" que verifique los Principios I–VII
  y justifique cualquier excepción en una tabla de complejidad.
- Toda integración de código MUST pasar: pruebas, linter, comprobación de tipos, auditoría de
  accesibilidad automática y verificación del presupuesto de rendimiento.
- Toda nueva herramienta MUST incluir: núcleo con pruebas, endpoint de API documentado, pantalla
  basada en el sistema de diseño y entrada en el registro de herramientas.
- Toda revisión de código MUST comprobar que el adaptador no ha ganado lógica (Principio VIII) y
  que los códigos de mensaje y de regla afectados conservan la compatibilidad (Principio X).

## Governance

- Esta constitución prevalece sobre cualquier otra práctica o guía del proyecto.
- Las enmiendas MUST documentarse en este archivo con su informe de impacto, indicar la nueva
  versión y, si afectan a funcionalidades existentes, incluir un plan de migración.
- Versionado semántico de la constitución: MAJOR para eliminar o redefinir principios de forma
  incompatible; MINOR para añadir principios o secciones o ampliar materialmente su alcance;
  PATCH para aclaraciones y correcciones de redacción.
- Toda revisión de especificaciones, planes y cambios de código MUST verificar el cumplimiento;
  cualquier desviación MUST justificarse por escrito o corregirse antes de integrar.
- La constitución se revisa al cerrar cada hito importante del producto.

**Version**: 1.2.0 | **Ratified**: 2026-11-05 | **Last Amended**: 2026-11-06
