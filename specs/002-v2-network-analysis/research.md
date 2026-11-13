# Research: Versión 2 — análisis técnico avanzado

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Fecha**: 2026-11-10

Decisiones técnicas de la versión 2, cada una con su razón y sus alternativas. Las de la feature
001 se citan como "001/R*n*" ([research de la 001](../001-mvp-url-toolkit/research.md)) y siguen
vigentes salvo que aquí se diga lo contrario.

Comprobaciones hechas sobre el entorno real del repositorio (Node 26.5.0, OpenSSL 3.6.3,
undici 8.12.4) antes de decidir:

- `crypto.X509Certificate` expone `subject`, `subjectAltName`, `issuer`, `validFromDate`,
  `validToDate`, `fingerprint256`, `keyUsage`, `serialNumber`, `signatureAlgorithm`, `ca`,
  `checkHost`, `checkIP`, `checkIssued`, `verify` y `raw` (DER). No expone la lista de
  extensiones.
- `dns.Resolver` ofrece `resolve4/6` (con TTL), `resolveMx`, `resolveNs`, `resolveTxt`,
  `resolveCaa`, `resolveSoa`, `resolveCname` y `resolveAny`. Solo A y AAAA devuelven TTL, y no
  hay forma de pedir el bit DO ni de leer el bit AD de la respuesta.
- `undici.dispatch` con un manejador de la API nueva expone `controller.rawHeaders`: las
  cabeceras en el orden recibido y con las repeticiones por separado. `request()` las entrega ya
  agrupadas en un objeto.

---

## R1. El servicio de sondas en Python no entra

**Decisión**: la versión 2 se implementa **entera en TypeScript sobre Node**, dentro de
`apps/api`. No se crea `services/probes/`, y la sección 11 de `docs/arquitectura.md` se cierra
sin abrir la frontera entre lenguajes, tal como prevé el propio documento ("Si Node resuelve el
alcance real, el sistema se queda en un solo lenguaje").

**Razón**: la condición de activación es que el alcance "no se resuelva con calidad suficiente
con las bibliotecas estándar de Node". Comparado capacidad por capacidad contra los requisitos de
la spec:

| Capacidad (requisito) | Node (decisión) | Python (`arquitectura.md` §2) | ¿Diferencia que importe? |
|---|---|---|---|
| Cabeceras en orden y repetidas (FR-020) | `undici.dispatch` + `rawHeaders` | HTTPX: `response.headers.raw` | No |
| Redirecciones con SSRF completa (FR-003, FR-021) | Ya existe y pasa los vectores (`apps/api/src/inspect`) | Habría que **reimplementarla** y probarla otra vez contra los vectores | **Sí, a favor de Node** |
| Cadena de certificados, fechas, nombres, firma (FR-040) | `tls.connect` + `getPeerCertificate(true)` + `X509Certificate` | `ssl` (cadena completa solo desde 3.13) + `cryptography` | No |
| Confianza y motivo del fallo (FR-041, FR-042) | `rejectUnauthorized: false` + `authorized` / `authorizationError` + `checkHost` | `ssl` con verificación aparte | No |
| Transparencia de certificados (FR-043) | Extensión SCT leída con `@peculiar/asn1-x509` | `cryptography` (`PrecertificateSignedCertificateTimestamps`) | No: ninguno de los dos lee las SCT de la extensión TLS ni del OCSP grapado; ambos leen la extensión del certificado |
| Registros DNS con TTL (FR-050) | DoH con formato binario (`dns-packet`) | dnspython | No, con DoH |
| Estado DNSSEC (FR-051) | Bit DO en la consulta, bit AD y EDE (RFC 8914) de la respuesta | dnspython: igual, o validación propia de la cadena | No: la spec pide el estado, y ambos lo obtienen de un resolutor validador (R6) |
| Metadatos de la página (FR-030–FR-033) | `parse5` (analizador conforme al estándar HTML de WHATWG) | BeautifulSoup / html5lib | No |
| Codificación de caracteres del documento | `TextDecoder` (etiquetas WHATWG, ICU completo) y preescaneo del estándar | `charset-normalizer` | No |

Ninguna fila deja a Node por debajo del alcance de la spec. La única diferencia real va a favor
de quedarse: un segundo lenguaje obligaría a duplicar la validación SSRF, que es la única
duplicación que admite la constitución y que solo se justifica si hay un segundo proceso que
conecte. Sin servicio de sondas, ese segundo proceso no existe.

**Consecuencias**:

- `docs/arquitectura.md`: la tabla "Versión 2" de la sección 2 y la sección 11 se actualizan con
  esta comparación (tarea de documentación de la v2).
- `CLAUDE.md` y el árbol "fuera de alcance" del plan de la 001 dejan de anunciar
  `services/probes/` para la v2.
- `tests/ssrf-vectors/` sigue siendo un artefacto de datos; ahora lo ejecutan los dos conectores
  de `apps/api` (R11).
- Si una versión posterior necesita algo que Node no resuelva bien (p. ej. validación DNSSEC
  propia de la cadena completa, o sondas que hoy no están en ninguna spec), la sección 11 se
  vuelve a evaluar entonces, con esa necesidad concreta.

**Alternativas consideradas**:

- *Servicio de sondas en Python desde la v2, como prevé la tabla de la sección 2*: rechazada.
  Duplica la protección SSRF, añade un proceso, un contrato interno, un segundo conjunto de
  dependencias y otra cadena de CI, sin capacidad nueva que lo pague (Principio VII).
- *Python solo para DNS*: rechazada. Con DoH y `dns-packet`, Node cubre FR-050–FR-054; abrir la
  frontera entre lenguajes por una sola herramienta es el caso que la sección 11 quiere evitar.

---

## R2. Observación en el adaptador, interpretación en el núcleo

**Decisión**: cada herramienta de red se divide igual que Redirect Inspector (001/R13):

- `apps/api/src/probes/<tool>/` hace la operación de red y devuelve una **observación**: lo que
  se vio, sin juicio (cabeceras crudas, bytes del documento, certificados, registros, banderas de
  la respuesta DNS).
- `packages/core/src/tools/<tool>/` recibe la observación y produce el **resultado**: evaluación
  de cabeceras, valores efectivos de metadatos, problemas del certificado, estado DNSSEC,
  hallazgos de seguridad.

El núcleo sigue sin red y sin reloj: la observación incluye `observedAt` (instante de la
consulta), y con él calcula, por ejemplo, los días que le quedan al certificado.
`ToolContext` gana un campo por adaptador de red (`fetchChain`, `probeTls`, `queryDns`), igual que
`fetchHop` en el MVP.

**Razón**: Principio VIII. Decidir que una `Content-Security-Policy` está mal configurada, que un
certificado caduca pronto o qué título usaría una vista previa son reglas de producto. Si viven en
el núcleo, se prueban con observaciones sintéticas, sin red y sin arrancar la API.

**Alternativas consideradas**: *evaluar en la sonda*. Rechazada: la sonda pasaría a contener reglas
de producto, que solo podrían probarse arrancando la red.

---

## R3. HTTP Headers reutiliza la cadena del inspector

**Decisión**:

- HTTP Headers recorre la cadena con la **misma lógica pura de Redirect Inspector** (`inspectTool`)
  y el mismo adaptador seguro (`safeFetch`), con los mismos límites (5 s por salto, 15 s en total,
  20 saltos). Una sola petición por salto: el adaptador guarda las cabeceras crudas de cada
  respuesta y el núcleo evalúa las del salto final.
- El transporte gana una variante sobre `undici.dispatch` que devuelve `rawHeaders`, para cumplir
  FR-020 (orden recibido, repeticiones por separado). La salida de Redirect Inspector no cambia.
- Las cabeceras evaluadas (FR-022) y la gravedad de cada problema están en el catálogo (R8).
  Comprobaciones mínimas:
  - `Strict-Transport-Security`: presente en `https`, `max-age` igual o mayor que el umbral del
    catálogo y sintaxis válida. En `http` no se evalúa, porque los navegadores la ignoran.
  - `Content-Security-Policy`: presencia, `unsafe-inline` o `unsafe-eval` en `script-src` (o en
    `default-src` si no hay `script-src`) y comodines en las fuentes de scripts. La versión
    `Report-Only` se identifica, pero no cuenta como protección.
  - `X-Content-Type-Options: nosniff`.
  - Protección contra el enmarcado: `frame-ancestors` en la CSP o `X-Frame-Options`, con valores
    válidos.
  - `Referrer-Policy`: presente y sin `unsafe-url`.
  - `Permissions-Policy`: presente.
  - Cookies: atributos `Secure`, `HttpOnly` y `SameSite` de cada `Set-Cookie`. Se informa el
    nombre de la cookie y sus atributos; **el valor nunca se devuelve**: el núcleo lo descarta al
    interpretar la observación.
- Un certificado no válido hace fallar la conexión (undici verifica), y el resultado es el error
  `inspect.tls` con una acción "Enviar a TLS". HTTP Headers no desactiva la verificación: eso es
  el trabajo de la herramienta TLS.

**Razón**: reutilizar la protección SSRF ya probada es lo que convierte a HTTP Headers en el
incremento más barato (spec, "Orden de entrega").

**Alternativas consideradas**:

- *Inspeccionar la cadena y repetir después un GET de la URL final*: rechazada. Duplica la
  petición al destino y puede dar respuestas distintas en cada una.
- *`node:http` con `res.rawHeaders`*: rechazada. Habría que reimplementar sobre otro cliente la
  fijación de IP y la desactivación de proxies que ya resuelve undici.
- *Devolver también los valores de las cookies* (el escenario 3 de la User Story 1 dice "sin
  almacenarse"): rechazada. Un valor de sesión es un dato que no aporta nada a la evaluación;
  mostrar el nombre y los atributos basta. Es la opción más conservadora con el Principio V.

---

## R4. Metadata: lectura del documento, codificación y análisis

**Decisión**:

- Misma cadena que R3. Del salto final se leen como máximo **1 MiB** de cuerpo, solo si la
  respuesta es 2xx y su tipo es HTML. Cuando se alcanza ese límite, el resultado lleva
  `truncated: true` (FR-032).
- La codificación se decide en el núcleo con el algoritmo del estándar HTML: BOM, después el
  `charset` de `Content-Type` y después el preescaneo de `<meta charset>` en los primeros
  1024 bytes. Si no se encuentra, `windows-1252`. El adaptador entrega bytes; el núcleo los
  decodifica con `TextDecoder` y la etiqueta elegida. Si la etiqueta no se reconoce, se avisa y se
  usa la de reserva.
- El núcleo analiza el HTML con `parse5` (conforme al estándar HTML de WHATWG) y extrae `<title>`,
  `<meta name|property>`, `<link rel=canonical|icon|alternate>` y `<html lang>`. No se ejecuta
  ningún script (FR-033): `parse5` solo construye el árbol.
- Precedencia del valor efectivo (FR-031), del dato más específico al más general: Open Graph,
  después tarjetas de redes y después las etiquetas básicas. El orden está en el catálogo (R8).
- `og:image` y el icono se devuelven como URL resueltas contra la base del documento. **La web
  los muestra como texto**, sin `<img>` (FR-009): cargar la imagen avisaría al tercero de la IP
  de la persona.

**Razón**: el estándar HTML es la referencia de lo que verá un navegador o un rastreador de vistas
previas; `parse5` lo implementa. Hacer el análisis en el núcleo lo deja probable con documentos
sintéticos.

**Cómo se inyecta** (añadido al implementar, 2026-11-11): el registro de herramientas también se
carga en la web, así que la definición de la herramienta no puede importar `parse5`. El analizador
vive en `packages/core/src/tools/metadata/html.ts`, se publica como `@urlkit/core/html` y la API lo
pasa en `ToolContext.parseHtml`, igual que el catálogo. La extracción recorre una estructura mínima
(`HtmlNode`) y no depende del analizador.

**Dependencia nueva**: `parse5` en `packages/core`. No tiene dependencias en tiempo de ejecución
salvo `entities`. Solo lo importa `tools/metadata`, y las páginas web de las demás herramientas no
lo cargan; `pnpm size` lo vigila.

**Alternativas consideradas**:

- *`htmlparser2`*: más rápido, pero no sigue el algoritmo de construcción del árbol del estándar
  (p. ej. etiquetas `meta` fuera de `head`, `template`, `noscript`). Rechazada por el Principio II.
- *Expresiones regulares sobre el HTML*: rechazada; el MVP las usa solo para detectar
  `meta refresh`, y extraer metadatos con ellas falla en casos frecuentes.
- *Proxy propio de imágenes para mostrar la vista previa*: rechazada. Es infraestructura y
  superficie de ataque nuevas (Principio VII) para algo que la spec no pide.

---

## R5. TLS con `node:tls` y la IP validada

**Decisión**:

- Conector nuevo `apps/api/src/probes/tls/` que usa el mismo `resolveTarget` y la misma política
  de puertos que `safeFetch`: resuelve el nombre, valida todas las direcciones y conecta a la IP
  validada con `tls.connect({ host: ip, servername, rejectUnauthorized: false, ALPNProtocols })`.
  `servername` (SNI) solo se envía si el host es un nombre; con una IP literal se omite y se
  indica en el resultado.
- Completa el *handshake*, lee y cierra. No envía datos de aplicación. Tiempo de espera de 5 s.
- Si el servidor corta la conexión antes de terminar el *handshake* (`ECONNRESET`), reintenta una
  vez, a la misma IP validada, ofreciendo solo grupos clásicos (`X25519:P-256:P-384`) y con su
  propio tiempo de espera. Node (OpenSSL 3.5 y posteriores) ofrece por defecto una clave híbrida
  poscuántica, como los navegadores actuales; algunos servidores cortan ese `ClientHello` más
  grande. El primer intento sigue siendo el del navegador (añadido al preparar T098b,
  2026-11-12).
- La observación incluye:
  - `protocol` (`getProtocol()`), `cipher` (`getCipher()`) y `alpn`;
  - `authorized` y `authorizationError`, la verificación de OpenSSL contra el almacén de raíces
    que trae Node (el de Mozilla);
  - la cadena, recorriendo `getPeerCertificate(true).issuerCertificate`, convertida a
    `X509Certificate` para cada eslabón;
  - el resultado de `checkHost` o `checkIP` en la hoja.
- El núcleo traduce `authorizationError` a problemas con nombre (FR-041): caducado, aún no válido,
  autofirmado, nombre no coincidente, cadena incompleta (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`,
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE`) y raíz no reconocida. Las fechas se comparan siempre contra
  `observedAt`, también cuando no hay error de OpenSSL, para avisar de la caducidad próxima. El
  umbral es de 30 días y está en el catálogo (R8).
- Transparencia de certificados (FR-043): se buscan en la hoja la extensión
  `1.3.6.1.4.1.11129.2.4.2` (SCT incrustadas) y el número de SCT, con `@peculiar/asn1-x509`.
  El resultado dice `embedded`, `absent` o `unknown`. No se comprueban las SCT que viajan en la
  extensión TLS ni en el OCSP grapado, y la interfaz no lo presenta como una comprobación
  completa.
- El conector sigue las reglas de 001/R6: sin proxy de entorno y conexión directa a la IP
  validada. Pasa los vectores de `tests/ssrf-vectors/` (R11).

**Razón**: `rejectUnauthorized: false` es lo que cumple FR-042 (mostrar el certificado aunque no
sea válido). La confianza no se pierde, porque se sigue leyendo de `authorized` y
`authorizationError`.

**Dependencias nuevas**: `@peculiar/asn1-x509` y su base `@peculiar/asn1-schema`, en `apps/api`.
Son TypeScript puro, sin código nativo, y se usan solo para enumerar extensiones X.509, que
`X509Certificate` no expone.

**Alternativas consideradas**:

- *Recorrer el DER a mano para buscar el OID*: rechazada. Un analizador ASN.1 propio es código
  frágil en una ruta de seguridad, y la dependencia es pequeña y está mantenida.
- *`@peculiar/x509` completo*: rechazada. Arrastra WebCrypto, `reflect-metadata` y `tsyringe` para
  algo que necesita solo el esquema de extensiones.
- *Informar también de las versiones de TLS admitidas*, con varios *handshakes*: fuera de la spec
  (pide la versión negociada); multiplicaría las conexiones al destino.

---

## R6. DNS por DoH con formato binario y resolutores fijos

**Decisión**:

- Las consultas van por **DNS sobre HTTPS** (RFC 8484, POST con `application/dns-message`) a dos
  resolutores validadores fijos, configurados en el servidor: **Cloudflare** (`1.1.1.1`) como
  principal y **Quad9** (`9.9.9.9`) como reserva. La persona no puede indicar un resolutor
  (FR-053). Se conecta a esas IP fijas con su nombre de servidor TLS, a través de undici.
- Mensajes codificados y decodificados con `dns-packet`. Cada consulta pide recursión y lleva
  EDNS(0) con el bit DO activo.
- Tipos consultados en paralelo (FR-050): A, AAAA, CNAME, MX, NS, TXT, CAA y SOA. Cada registro
  conserva su TTL. Las respuestas que llegan truncadas no son un problema: DoH no tiene el límite
  de tamaño de UDP.
- Estado DNSSEC (FR-051), decidido en el núcleo a partir de las banderas de la observación:
  - **validado**: `NOERROR` o `NXDOMAIN` con el bit AD activo;
  - **firma inválida**: `SERVFAIL` con un EDE de DNSSEC (códigos 1–12 de la RFC 8914, p. ej.
    6 "DNSSEC Bogus"), o `SERVFAIL` que se resuelve al repetir la consulta con el bit CD (sin
    validar);
  - **sin firmar**: respuesta correcta con el bit AD apagado.
  El resultado declara qué resolutor dio la respuesta, porque el estado depende de su validación.
- Resultados distintos (FR-052): `NXDOMAIN` (no existe), `NOERROR` sin respuestas (no hay
  registros de ese tipo) y fallo de transporte o `SERVFAIL` sin EDE de DNSSEC (fallo de la
  consulta).
- Entrada (FR-054): URL o nombre de host. El núcleo saca el host, sus formas Unicode y ASCII y el
  dominio registrable (con `tldts`, como ya hace). Por defecto se consulta el host; la petición
  puede pedir `target: "registrable"`. Se rechazan con un código propio las direcciones IP literales
  y los nombres de uso especial de la RFC 6761 y similares (`localhost`, `.local`, `.test`,
  `.invalid`, `.example`, `.onion`, `.internal`, `.home.arpa`).
- Tiempo de espera de 3 s por consulta y de 5 s en total. El resolutor de reserva solo se usa si
  el principal falla en transporte, no si responde `NXDOMAIN` ni `SERVFAIL`.

**Razón**:

- `node:dns` no devuelve TTL fuera de A/AAAA ni deja leer el bit AD: no cumple FR-050 ni FR-051.
- DoH sale por el puerto 443, que ya permiten el cortafuegos de salida del Compose y los grupos de
  seguridad de los proveedores gestionados (`infrastructure/README.md`); el puerto 53 hacia
  Internet habría que abrirlo en ambos sitios.
- El destino de la conexión es fijo y no lo elige la persona, así que no es una superficie SSRF.
  Aun así, la protección se mantiene: las IP de los resolutores son públicas y pasan
  `isBlockedAddress`, y esa comprobación tiene una prueba.

**Privacidad**: el resolutor ve el nombre consultado, que llega desde la IP del servidor, nunca
desde la de la persona. `docs/privacidad.md` lo explicará y nombrará a los dos resolutores.

**Dependencia nueva**: `dns-packet` en `apps/api`. Es pequeña, mantenida y sin código nativo, y
cubre los tipos pedidos, EDNS y las opciones EDE.

**Alternativas consideradas**:

- *`node:dns` (`Resolver`)*: rechazada por falta de TTL y del bit AD, como se ha dicho.
- *UDP/TCP 53 directo con `dns-packet`*: viable técnicamente, pero obliga a abrir un puerto de
  salida nuevo en cada despliegue y a gestionar el truncado y el reintento por TCP.
- *Validar DNSSEC en nuestro proceso (cadena hasta la raíz)*: rechazada en la v2. Es lo que
  justificaría reabrir la sección 11 de la arquitectura, y la spec no lo pide: pide el estado.
  Queda anotado en R1 como motivo posible para reevaluar.
- *Un solo resolutor*: rechazada. Sin reserva, una caída del proveedor deja DNS fuera de servicio
  y degrada Security Analysis.

---

## R7. Security Analysis: orquestación en el adaptador, decisiones en el núcleo

**Decisión**:

- El núcleo expone dos funciones puras:
  - `reviewTargets(input, chain)`: decide qué se comprueba. La cadena se sigue desde la URL de
    entrada; TLS y cabeceras se miran en la URL final si es `https`; DNS, en el host final y en
    su dominio registrable si es distinto.
  - `review(parts)`: convierte los resultados parciales en hallazgos (`Finding`), cada uno con
    código, gravedad, herramienta de origen y parámetros. Los ordena por gravedad y, a igual
    gravedad, por el orden fijo de herramientas (URL → redirecciones → cabeceras → TLS → DNS).
    Con la misma entrada, siempre da la misma salida (FR-061).
- El adaptador ejecuta los pasos en este orden:
  1. Explain URL sobre la entrada (núcleo, inmediato).
  2. La cadena con sus cabeceras (R3), con 6 s de presupuesto.
  3. TLS y DNS del destino final, en paralelo, con 4 s de presupuesto.

  El límite total es de 10 s (SC-001). La parte que no termina a tiempo o falla queda como
  `incomplete`, con su código, y no detiene el resto (FR-062).
- Si la entrada apunta a una dirección bloqueada, no se hace ninguna conexión. Solo se devuelven
  las señales de Explain URL y el hallazgo del bloqueo (escenario 4 de la User Story 5).
- Gravedades: `high`, `medium`, `low` e `info`. La gravedad de cada código de hallazgo está en el
  catálogo (R8), también para las señales de Explain URL (`caution` → `medium`, `info` → `info`
  por defecto).
- Sin nota, sin puntuación y sin veredicto (FR-064, aclaración del 2026-11-10). El resultado
  incluye `scope`, con las comprobaciones hechas (`checked`) y las que no se hacen (`notChecked`):
  al menos `reputation` y `content` (no se analiza el contenido de la página en busca de
  *phishing* o malware). La interfaz las enumera siempre (FR-063).
- Un análisis cuenta como **un uso** de la cuota `security` (FR-065). Las sondas internas no
  descuentan de las cuotas de las otras herramientas.

**Razón**: elegir qué host se comprueba o qué gravedad tiene un hallazgo es lógica de producto
(Principio VIII); ejecutar en paralelo con presupuestos de tiempo es transporte. Separarlo así
permite probar todo `review` con resultados sintéticos.

**Alternativas consideradas**:

- *Que la web llame a las cuatro herramientas y combine*: rechazada. Gastaría cuatro cuotas, haría
  la combinación en el cliente y no existiría como API (Principio IV).
- *Cadena, TLS y DNS en paralelo sobre el host de entrada*: más rápido, pero analiza el acortador
  en lugar del destino, que es lo que interesa a la persona.

---

## R8. Los criterios viven en el catálogo de reglas

**Decisión**: los criterios versionables (FR-010) se añaden como datos a `packages/rules/data/`,
junto a `abuse-tlds.json`, que ya sigue este patrón para Explain URL:

- `security/headers.json`: cabeceras evaluadas, umbral de `max-age` de HSTS y valores aceptados.
- `security/severities.json`: gravedad de cada código de hallazgo.
- `security/tls.json`: umbral de caducidad próxima (30 días) y algoritmos de firma débiles.
- `metadata/precedence.json`: orden de las fuentes para el valor efectivo.

Los compila el mismo `build/compile.ts`, con un esquema propio en `schema/`. El catálogo sube a
**1.3.0** (MINOR: añade datos sin cambiar ninguna regla existente) y se actualiza el *lock*. Cada
respuesta de HTTP Headers, Metadata, TLS y Security Analysis declara `catalogVersion`. DNS no
depende del catálogo y no la declara.

El núcleo recibe estos criterios inyectados (001/R18), igual que el catálogo de limpieza; sus
pruebas usan criterios sintéticos.

**Razón**: Principio X. Hay una sola versión que declarar y un solo mecanismo de *lock* y de
validación por esquema.

**Alternativas consideradas**: *un catálogo de criterios aparte, con versión propia*. Rechazada:
dos versiones que declarar y otro mecanismo de *lock*, sin un beneficio que lo compense mientras
cambien al mismo ritmo.

---

## R9. Cuotas

**Decisión**: `ANONYMOUS_PLAN` (`apps/api/src/quota/plans.ts`) añade cinco claves, cada una de
10/hora y 50/día: `headers`, `metadata`, `tls`, `dns` y `security`. Usan el mismo limitador, el
mismo sujeto seudonimizado, el mismo prefijo de claves de Valkey (001/R14) y las mismas cabeceras
`RateLimit-*` y `Retry-After`. Agotar una cuota no afecta a las demás (FR-005).

**Razón**: es la suposición de la spec. No cambia la forma del limitador ni la del sujeto.

**Alternativas consideradas**: *una cuota compartida "red"* para las cinco y el inspector.
Rechazada: FR-005 exige que agotar una herramienta no bloquee las demás.

---

## R10. Contrato: ampliación compatible de `/v1`

**Decisión**:

- Endpoints nuevos: `POST /v1/headers`, `/v1/metadata`, `/v1/tls`, `/v1/dns` y `/v1/security`.
  Todos aceptan `?lang` y el esquema `apiKey` opcional, y usan las mismas respuestas de error
  (400, 429 y 503) y las cabeceras de cuota. El detalle está en
  [contracts/openapi.yaml](./contracts/openapi.yaml).
- Crecen los `enum` de `ToolId` y `MessageCode`. Añadir valores es compatible según la política
  del contrato (001/R15). La descripción del `enum` lo dirá explícitamente: los clientes deben
  aceptar valores que no conozcan.
- Los códigos de bloqueo de conexión ya publicados (`inspect.blocked.*`) se reutilizan en TLS con
  el mismo significado: "la conexión saliente se bloqueó por este motivo". No se crea una familia
  paralela que diga lo mismo.
- Códigos nuevos con prefijo por herramienta: `headers.*`, `metadata.*`, `tls.*`, `dns.*` y
  `security.*`. Están en `packages/core/src/codes.ts` y tienen textos en es/en en
  `packages/i18n`. La prueba de paridad de los catálogos de mensajes los cubre.
- Respuesta nueva `503`, con el código del núcleo `dns.unavailable`, para cuando no responde
  ninguno de los dos resolutores. Es el modo de fallo que el contrato declara (Principio IX). Las
  demás herramientas no usan `503`: un destino que no responde es un resultado (`200` con su
  código de error en el resultado), igual que en Redirect Inspector.

**Razón**: la spec exige no publicar `/v2` (FR-006), y el Principio IV solo lo exige para cambios
incompatibles.

**Alternativas consideradas**: *un único `POST /v1/analyze?tool=...`*: rechazada. Rompe el patrón
de un endpoint por herramienta y mezcla esquemas de respuesta distintos en un solo contrato.

---

## R11. Protección SSRF en los dos conectores

**Decisión**:

- `resolveTarget`, `isBlockedAddress` y la política de puertos se quedan en
  `apps/api/src/inspect/ssrf.ts` y los importan los dos conectores (`safeFetch` y el de TLS). No
  se copia ninguna regla.
- La suite SSRF de `apps/api/tests/ssrf/` se parametriza por conector: los mismos
  `tests/ssrf-vectors/vectors.json` se ejecutan contra `safeFetch` y contra el conector TLS. Una
  prueba falla si un conector nuevo no figura en esa lista.
- DNS no conecta con el destino. Su prueba de seguridad es otra: las IP de los resolutores fijos
  son públicas, y los nombres de uso especial se rechazan.
- El cortafuegos de salida no cambia: todo sale por 443 (y 80, 8080 o 8443, que ya permite la
  política del inspector).

**Razón**: Principio V, que no admite una protección parcial, y R1: al no haber segundo lenguaje,
la protección no se duplica, se comparte.

---

## R12. Web: cinco páginas nuevas por idioma

**Decisión**:

- Páginas `/[lang]/headers`, `/metadata`, `/tls`, `/dns` y `/security`, cada una con su isla Vue.
  Reutilizan `UrlInput`, `ResultBox`, `CopyButton`, `SendTo`, `ErrorMessage` e `InertLink` de
  `packages/ui`.
- `apps/web/src/lib/api.ts` generaliza el cliente de `inspect` a un `callTool(tool, body)` tipado
  desde `packages/contracts`, con la misma lectura de `RateLimit-*`.
- "Enviar a" (FR-008): las diez herramientas aparecen en `sendTo` según su sentido. Por ejemplo,
  HTTP Headers envía a TLS, Redirect Inspector y Security Analysis, y DNS envía a TLS.
- Estas cinco herramientas son de servidor: la URL viaja en el cuerpo del POST a la API, nunca en
  la ruta ni en la consulta. El enlace compartible usa el fragmento, como en el MVP.
- Ningún valor externo se renderiza como HTML. Las URL de imágenes, iconos y la canónica se
  muestran con `InertLink`, que no carga nada y no convierte en enlace activo los esquemas
  peligrosos.

**Alternativas consideradas**: *una página "Análisis técnico" con pestañas para las cinco*.
Rechazada por el Principio III (una tarea por pantalla) y el I (herramientas independientes).

---

## R13. Pruebas

**Decisión**:

- **Núcleo**, con las pruebas primero: observaciones sintéticas por herramienta. Cubren cabeceras
  repetidas y mal formadas, CSP con `unsafe-inline`, HSTS en `http`, documentos en
  `windows-1252` y en UTF-8 con BOM, `meta` fuera de `head`, cadenas de certificados con cada
  `authorizationError`, respuestas DNS con y sin AD, EDE y `NXDOMAIN`, y `review` con partes que
  faltan.
- **API, integración**: servidores locales de prueba. Hay un servidor HTTPS con certificados de
  prueba (válido, caducado, autofirmado, de otro nombre y sin intermedio), generados con
  `openssl` por un script y versionados en `apps/api/tests/fixtures/tls/`. Hay también un
  resolutor DoH falso hecho con `dns-packet`, que devuelve respuestas grabadas.
- **Contrato**: las respuestas de los cinco endpoints se validan contra `openapi.json` (lado
  proveedor) y el cliente de la web contra los mismos esquemas (lado consumidor).
- **SSRF**: R11.
- **E2E y accesibilidad**: Playwright con axe en las cinco páginas nuevas, con la API simulada
  como en el inspector.
- **Conjuntos de referencia** (SC-003 a SC-006: 50 sitios, 50 páginas, hosts de prueba de
  certificados, dominios firmados y sin firmar): son validaciones contra la red real, **no** van
  en CI. Se ejecutan con un script manual y se registran en `validation/`, como en la 001.

---

## R14. Privacidad y observabilidad

**Decisión**:

- Las trazas llevan como máximo el dominio registrable, igual que hoy. Los tramos de red registran
  la herramienta, la duración, el resultado y, para TLS, la versión del protocolo. Nunca registran
  cabeceras, contenido del documento, certificados ni registros DNS.
- No se guardan resultados en caché (suposición de la spec).
- La prueba de depuración de errores existente se amplía a los cinco endpoints: ningún campo de
  la entrada ni de la observación llega al servicio de errores.
- `docs/privacidad.md` se actualiza con la implementación: qué llega al servidor en cada
  herramienta y que los resolutores DoH ven el nombre consultado.
