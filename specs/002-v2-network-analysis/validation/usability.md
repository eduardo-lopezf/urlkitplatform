# Prueba de usabilidad de Security Analysis (002/T098b, SC-007)

**Estado**: protocolo preparado y ensayado sin participantes (2026-11-12). Pendiente de ejecutar
con personas. El fallo de negociación TLS que encontró el ensayo está corregido (ver «Ensayo
previo»); queda un fallo residual por tiempo agotado de en torno a 1 de cada 10 análisis en los
enlaces de badssl.com, así que conviene repetir el análisis si TLS sale «Incompleto».

**Criterio** (spec, SC-007): el 90 % o más de participantes no técnicos identifican, tras usar
Security Analysis, el problema más grave de un enlace de prueba y entienden qué no se ha
comprobado.

## Protocolo

- **Participantes**: los mismos 10 de la prueba de la 001
  (`specs/001-mvp-url-toolkit/validation/usability.md`): personas sin perfil técnico, mitad en
  español y mitad en inglés.
- **Material**: `/es/security` o `/en/security`, en un móvil de 360 px y en un portátil. Cada
  enlace se abre con su enlace compartible; el análisis no arranca solo, así que el participante
  pulsa «Analizar» / «Analyze».
- **Tarea**: para cada enlace, sin ayuda del moderador, dos preguntas:
  1. «¿Cuál es el problema más grave de este enlace?»
  2. «¿Qué no ha comprobado la herramienta?»
- **Acierto**: en la pregunta 1, el problema de la tabla con sus palabras («el certificado ha
  caducado» vale; «faltan cabeceras» no). En la pregunta 2, mencionar la reputación del sitio
  (listas de sitios peligrosos o de phishing) o el contenido de la página (phishing, malware,
  descargas).
- **Registro**: acierto o fallo por pregunta, tiempo hasta responder, si tuvo que desplazarse para
  encontrar la respuesta y comentarios literales.
- **Éxito**: al menos 9 de 10 participantes aciertan las dos preguntas en cada enlace.

| # | Enlace | Problema más grave esperado | Gravedad |
| --- | --- | --- | --- |
| 1 | `https://postman-echo.com/redirect-to?url=http://example.com/` | Una redirección pasa de `https` a `http`: desde ahí el tráfico va sin cifrar | Alta |
| 2 | `https://expired.badssl.com/` | El certificado ha caducado | Alta |
| 3 | `https://self-signed.badssl.com/` | El certificado es autofirmado: nadie de confianza lo ha emitido | Alta |
| 4 | `https://wrong.host.badssl.com/` | El certificado es de otro nombre, no de este sitio | Alta |

Los cuatro tienen un único hallazgo de gravedad alta y no dependen de las cabeceras del día, que
cambian. Enlaces compartibles (anteponer el origen, por ejemplo `http://localhost:4321`; en
inglés, cambiar `/es/` por `/en/`):

| # | Enlace compartible |
| --- | --- |
| 1 | `/es/security#u=https%3A%2F%2Fpostman-echo.com%2Fredirect-to%3Furl%3Dhttp%3A%2F%2Fexample.com%2F` |
| 2 | `/es/security#u=https%3A%2F%2Fexpired.badssl.com%2F` |
| 3 | `/es/security#u=https%3A%2F%2Fself-signed.badssl.com%2F` |
| 4 | `/es/security#u=https%3A%2F%2Fwrong.host.badssl.com%2F` |

Cuota: Security Analysis permite 10 análisis por hora y 50 al día por persona. Cuatro enlaces en
dos dispositivos son 8 por participante; si la sesión se hace desde una sola red con varias
personas seguidas, la API compartida agota el límite. Usar una API local (`pnpm dev`) o repartir a
los participantes en el tiempo.

## Sesión conjunta con la 001 (T103)

Una sola sesión de unos 30 minutos por participante:

1. Explain URL, 001/T103: las cinco URLs de su protocolo, unos 10 minutos.
2. Pausa breve.
3. Security Analysis, este protocolo: los cuatro enlaces, unos 15 minutos.
4. Dos preguntas abiertas al final, unos 5 minutos: qué le ha resultado confuso y si confiaría en
   un enlace solo porque la herramienta no muestra problemas graves.

El orden va de lo sencillo a lo complejo: Explain URL no hace peticiones y su resultado aparece al
instante.

El guion palabra por palabra, la preparación de la víspera (con la API propia de la sesión, que se
reinicia entre participantes por la cuota) y la hoja de resultados están en
[`session-day.md`](./session-day.md).

## Ensayo previo sin participantes (2026-11-12)

Comprueba que el material funciona, no la usabilidad. Se hizo contra una API local (Node 26,
puerto 8788) y la web compilada apuntando a ella, en español e inglés, a 360 px y a 1024 px.

| # | Resultado del ensayo |
| --- | --- |
| 1 | Estable en tres ejecuciones seguidas: primer hallazgo `security.hop.https-downgrade` (alta), todas las partes revisadas salvo TLS («No aplica», el destino es `http`) |
| 2 | Antes de la corrección, en una de dos ejecuciones, TLS «Incompleto» y ningún hallazgo alto. Después: `tls.expired` (alta) en 3 de 3 |
| 3 | Antes, igual que el 2. Después: `tls.self-signed` (alta) en 3 de 3 |
| 4 | Antes, correcto en una de tres ejecuciones (`tls.timeout` o `tls.handshake-failed` en las otras). Después: `tls.name-mismatch` (alta) en 2 de 3; en la otra, TLS agotó su tiempo |

### Hallazgo: la sonda TLS falla con algunos servidores por la clave poscuántica

Node 26 (OpenSSL 3.6) y la imagen de producción (Node 24, OpenSSL 3.5) envían por defecto, en el
`ClientHello`, una clave híbrida poscuántica (X25519MLKEM768). El mensaje es más grande y el
servidor de badssl.com corta la conexión (`ECONNRESET`) a ratos. Medido con `tls.connect` contra
los tres hosts de badssl.com:

| Entorno | Grupos por defecto | Solo curvas clásicas (`X25519:P-256:P-384`) |
| --- | --- | --- |
| Node 26, máquina de desarrollo | 19/30 | 29/30 |
| Node 24, contenedor de la API | 9/20 | 18/20 |

curl, con la biblioteca TLS del sistema, negoció bien 9 de 10 veces. Es un fallo de URLkit:
afecta a la herramienta TLS y a Security Analysis con cualquier servidor que se comporte así, no
solo en esta prueba. También explica los «fallos de red pasajeros» de SC-005 registrados en
`reference-sets.md`.

**Corregido el 2026-11-12** en `apps/api/src/probes/tls/connect.ts`: si el servidor corta la
negociación (`ECONNRESET`), la sonda reintenta una vez, a la misma IP validada, solo con curvas
clásicas y con su propio tiempo de espera. El primer intento sigue siendo el de un navegador
actual. Lo cubre una prueba en `apps/api/tests/integration/tls.test.ts` con un servidor local que
corta los `ClientHello` grandes; la regla está en research R5. Medido después contra badssl.com:

| Medición | Resultado tras la corrección |
| --- | --- |
| Herramienta TLS, 3 hosts × 10 | 30/30 correctos; mediana 1,4 s, p95 3,5 s, máximo 6,8 s |
| Security Analysis, enlaces 2–4 × 3 | 8/9 con su hallazgo alto; en el otro, TLS agotó su tiempo (4 s) sin corte |

El fallo residual es un tiempo agotado sin corte, que también tienen las curvas clásicas solas
(2 de cada 30 en la medición directa): lentitud del servidor, no de URLkit.

**El cliente HTTP tenía el mismo fallo.** `safeFetch` (Redirect Inspector, HTTP Headers, Metadata y
la cadena de Security Analysis) negocia TLS con los mismos valores por defecto. Contra
`https://sha256.badssl.com/`, un host con certificado válido, HTTP Headers falló 8 de 20 veces
(7 `inspect.tls` y 1 `inspect.timeout`). Corregido el mismo día en
`apps/api/src/inspect/safe-fetch.ts` con la misma regla: un reintento, a la misma IP fijada,
solo con curvas clásicas. Prueba en `apps/api/tests/integration/transport-tls.test.ts`; la regla
está en 001 research R6.

| HTTP Headers en `https://sha256.badssl.com/`, 20 análisis | Correctos | `inspect.tls` | `inspect.timeout` |
| --- | --- | --- | --- |
| Antes de la corrección | 12 | 7 | 1 |
| Después | 16 | 0 | 4 |
| Referencia: solo curvas clásicas desde el principio (undici directo) | 19 | 0 | 1 |

Desaparecen los errores de TLS, pero quedan más tiempos agotados que en la referencia. Aquí el
reintento comparte el límite de 5 s del salto (001 research R6, spec 001): cuando el corte tarda en
llegar (hasta 2,5 s medidos) y el reintento también (hasta 2,8 s), no cabe. La sonda TLS no tiene
ese problema porque su reintento tiene plazo propio. Darle plazo propio aquí supondría superar el
límite por salto de la spec.

**Decisión (2026-11-12): se deja así.** El fallo grave, errores de TLS falsos, está resuelto, y el
límite por salto protege el tiempo total (15 s) y SC-001. Con un servidor que corte de este modo,
alguna vez se verá «tiempo agotado», que se resuelve repitiendo el análisis. Se reabre si con
sitios reales aparecen muchos tiempos agotados.

### Observaciones

- **«Qué no se ha comprobado» queda lejos.** A 360 px, en el enlace 1, empieza a 1690 px de un
  documento de 2525 px: después de nueve hallazgos, a más de dos pantallas. A 1024 × 768 empieza
  a 1262 px, también fuera de la primera pantalla. La pregunta 2 obliga a desplazarse; si muchos
  participantes no lo encuentran, el resultado medirá la posición de la sección, no su texto.
  **Atendida el 2026-11-15 (T088a):** encima de los hallazgos hay ahora una línea de resumen
  («No se ha comprobado: la reputación del sitio y el contenido de la página. Ver detalles»), con
  un enlace al bloque completo, que sigue debajo de los hallazgos. Medido con una revisión
  simulada de nueve hallazgos parecida a la del enlace 1: a 360 × 740, el resumen empieza a 627 px
  y el hallazgo más grave a 756 px (antes, 708); a 1024 × 768, a 487 px y 592 px (antes, 568), los
  dos en la primera pantalla. En el móvil el formulario ocupa casi toda la primera pantalla, así
  que las dos preguntas siguen pidiendo desplazarse un poco; se mantiene el registro de si el
  participante tuvo que hacerlo.
- **Las partes incompletas pueden confundir.** Con un certificado inválido, redirecciones y
  cabeceras aparecen como «Incompleto» porque el servidor HTTP no acepta conectar sin un
  certificado válido. Es correcto, pero la palabra puede leerse como un fallo de la herramienta.
- **El destino `http://neverssl.com/` se descartó**: tardó 6,4 s en responder también a curl y
  agota a veces el límite de 5 s por salto. Se usa `http://example.com/`.
- **Candidatos descartados**: `https://dnssec-failed.org/` (el resolutor no lo resuelve, así que
  se bloquea entero y solo queda `inspect.blocked.unresolvable`) y enlaces con `@` o con
  homógrafos (se bloquean todas las comprobaciones de red y quedan dos hallazgos de gravedad media
  empatados, sin una respuesta única).
- **Privacidad**: el registro de la API local durante el ensayo (30 líneas) no contiene ninguna
  URL, dominio ni IP.

## Simulación con Claude (2026-11-17), ensayo previo

**Qué es y qué no es.** Un recorrido cognitivo hecho por Claude con diez personas ficticias, no
una prueba con personas: Claude no carece de conocimientos técnicos y conoce las respuestas
esperadas, porque escribió el protocolo. **No cuenta para SC-007 ni cierra la tarea**; sirve para
encontrar lo que confundiría a alguien y corregirlo antes de la sesión real. La tabla
«Resultados» sigue vacía para las personas.

**Cómo se hizo.** La interfaz real, compilada y servida en local con la API de la sesión
(`session-day.md`), en el navegador integrado a 360 × 740 y a 1280 × 800, en los dos idiomas.
Cada persona «ve» solo las capturas de lo que hay en pantalla y se desplaza solo si su perfil lo
haría. Cada respuesta se decidió con el texto visible en que se apoya, antes de compararla con la
esperada, y se anota como fallo cuando la persona dudaría o se equivocaría, aunque Claude sepa la
respuesta. El tiempo no se puede medir y no se registra.

Las diez personas son las de la simulación de la 001
(`specs/001-mvp-url-toolkit/validation/usability.md`, «Simulación con Claude»). Los 16 análisis
(cuatro enlaces, dos idiomas, móvil y portátil) dieron el hallazgo alto esperado a la primera, sin
repeticiones por TLS. Posiciones tras el análisis: a 360 × 740, el resumen «No se ha comprobado»
empieza a 627 px en S1 y a 556 px en S2–S4, y los hallazgos a 691 px y 620 px; a 1280 × 800, a 487
px y 527 px.

| Part. | S1 P1/P2 | S2 P1/P2 | S3 P1/P2 | S4 P1/P2 | ¿Se desplazó? | Razonamiento |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | Un poco, en S1 | «Que no va cifrado»; la pregunta 2, con el resumen |
| A02 | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | No | La barra roja de «Gravedad alta» |
| A03 | ✗/✓ | ✓/✓ | ✓/✓ | ✓/✓ | No | S1: en la primera pantalla ve «No se ha comprobado: la reputación del sitio…» y lo da como el problema más grave; el hallazgo alto queda justo debajo |
| A04 | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | No | No entiende «Redirect Inspector» ni «DNSSEC», pero no le hacen falta |
| A05 | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | Un poco, en S1 | Va directa a la barra roja |
| A06 | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | No | En S2–S4 lee «Redirects: Incomplete» y pregunta si la herramienta ha fallado |
| A07 | ✗/✓ | ✓/✓ | ✓/✓ | ✓/✓ | No | S1: como A03. En S2–S4 el hallazgo alto asoma al pie de la primera pantalla |
| A08 | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | No | Repite «the certificate expired» sin saber qué es un certificado; vale según el criterio |
| A09 | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | Sí, en S1 | S3: «a problem with the certificate, self-signed», sin entender «vouches» |
| A10 | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | No | El resaltado y el orden por gravedad |

**Resultado simulado**: S1 8/10, por debajo del criterio (9 de 10); S2, S3 y S4 10/10. La pregunta
2 la aciertan todos en todos los enlaces, gracias al resumen de T088a.

Preguntas finales: lo confuso fue «Incompleto» (A04, A06), las frases largas (A09) y la cantidad
de texto (A01). A la segunda, ocho dirían que no se fiarían solo por eso; A03 y A07, que
«probablemente sí», justo las dos que no se desplazan: no llegan a leer «Esta revisión describe
aspectos técnicos; no dice si puedes fiarte del sitio».

Hallazgos y propuestas. **Aplicada el mismo día** la 1 (T088b); la 2 y la 3 siguen abiertas:

1. **S1 en el móvil: el resumen ocupa el lugar donde se espera el problema principal.** En la
   primera pantalla se ven «Destino final» y «No se ha comprobado…», y el hallazgo alto empieza
   justo debajo del borde. En S2–S4 no pasa porque no hay «Destino final». En el navegador
   integrado, el clic real desplazó la página 116 px y dejó el hallazgo a la vista; en un móvil real
   no está garantizado, y por eso se mantiene el registro de si la persona se desplazó. Propuestas:
   poner el hallazgo más grave antes del resumen, o llevar el foco a «Hallazgos» al terminar el
   análisis. Es un cambio de la isla, sin tocar la API. **Aplicada**: al llegar la revisión, la
   página se desplaza lo justo para que el grupo más grave quede entero a la vista, con el resumen
   encima; si ya lo estaba, como en el portátil, no se mueve.
2. **«Incompleto» se lee como un fallo de la herramienta**, como ya anotó el ensayo. Propuesta: que
   el motivo («el certificado del destino no es válido») se lea como consecuencia del problema
   encontrado, no como un error.
3. **El aviso de que la revisión no dice si fiarse del sitio** solo lo leen quienes llegan al final.
   Propuesta: valorar añadirlo a la línea de resumen de arriba.

## Resultados

| Participante | Idioma | Dispositivo | 1 | 2 | 3 | 4 | Comentarios |
| --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — | Pendiente |
