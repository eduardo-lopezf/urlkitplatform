# Validación: conjuntos de referencia (002/T096)

**Fecha**: 2026-11-12T01:04:46.478Z · **Catálogo**: 1.3.0 · **Node**: v26.5.0

Ejecutado con `node apps/api/scripts/reference-check.ts`, contra la red real, desde la máquina de desarrollo. Usa los adaptadores de producción y las herramientas del núcleo, sin la API ni sus cuotas.

| Criterio | Resultado |
| --- | --- |
| SC-001 tiempos de respuesta, desde local | 98–100 % por debajo del objetivo en las cinco herramientas (≥ 95 %); falta la medición en producción |
| SC-003 HTTP Headers (estado y cabeceras frente a curl) | 48/48 (100 %) de los sitios estables, 2 de 50 excluidos (4 %, límite 10 %), ejecución del 2026-11-13, tras corregir un falso positivo de Redirect Inspector en google.com |
| SC-003 evaluación de cabeceras frente a revisión manual | 412/412 (100 %) tras corregir los dos fallos encontrados (411/412 antes); revisión independiente, falta muestra humana |
| SC-004 Metadata | 200/200 (100 %) sobre las instantáneas del 2026-11-12; revisión independiente, falta muestra humana |
| SC-005 TLS | 6/6 (100 %) |
| SC-006 DNSSEC | 7/7 (100 %) |

## SC-001 — Tiempos de respuesta (002/T098a)

Ejecutado con `node apps/api/scripts/reference-check.ts --timing http://localhost:8788`, contra una
API local (`PORT=8788 TRUST_PROXY=1 node apps/api/src/server.ts`, contadores en memoria) y desde la
máquina de desarrollo. Cada análisis se mide de principio a fin a través de la API: desde que se
envía la petición hasta que se lee la respuesta entera, uno cada vez, sobre los 50 sitios de la
lista de SC-003. Con `TRUST_PROXY=1`, cada petición lleva una IP de cliente distinta de un rango de
documentación, para que la cuota de 10 por hora no corte la medición.

**Fecha**: 2026-11-12T23:55:34.520Z · **API**: `http://localhost:8788` · **Node**: v26.5.0

| Herramienta | Muestras | p50 | p95 | Máximo | Por debajo del objetivo | Objetivo | ≥ 95 % | De ellas, error | 429 o sin conexión |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| headers | 50 | 0.38 s | 1.58 s | 10.43 s | 49/50 (98 %) | < 5 s | ✅ | 0 | 0 |
| metadata | 50 | 0.43 s | 1.91 s | 10.41 s | 49/50 (98 %) | < 5 s | ✅ | 0 | 0 |
| tls | 50 | 0.08 s | 0.29 s | 5.01 s | 49/50 (98 %) | < 5 s | ✅ | 0 | 0 |
| dns | 50 | 0.14 s | 0.53 s | 1.05 s | 50/50 (100 %) | < 5 s | ✅ | 0 | 0 |
| security | 50 | 0.45 s | 1.86 s | 14.41 s | 49/50 (98 %) | < 10 s | ✅ | 0 | 0 |

Las tres más lentas de cada herramienta:

| Herramienta | URL | Tiempo |
| --- | --- | --- |
| headers | `https://www.gnu.org/` | 10.43 s |
| headers | `https://ubuntu.com/` | 1.91 s |
| headers | `https://www.spiegel.de/` | 1.58 s |
| metadata | `https://www.gnu.org/` | 10.41 s |
| metadata | `https://www.spiegel.de/` | 2.79 s |
| metadata | `https://www.netflix.com/` | 1.91 s |
| tls | `https://www.gnu.org/` | 5.01 s |
| tls | `https://archlinux.org/` | 0.57 s |
| tls | `https://ubuntu.com/` | 0.29 s |
| dns | `https://european-union.europa.eu/` | 1.05 s |
| dns | `https://www.gov.uk/` | 0.61 s |
| dns | `https://www.lemonde.fr/` | 0.53 s |
| security | `https://www.gnu.org/` | 14.41 s |
| security | `https://www.spiegel.de/` | 1.87 s |
| security | `https://www.google.com/` | 1.86 s |

El único caso fuera de objetivo, en headers, metadata, tls y security, es `www.gnu.org`. Es el
mismo sitio que no respondió en 15 s ni a URLkit ni a curl en SC-003: la herramienta espera hasta
sus límites (5 s por salto, 15 s en total) y luego informa de que no hubo respuesta, así que es un
caso de cola esperado, no de lentitud propia. Las demás medianas quedan por debajo de medio segundo.

Esta medición indica que el objetivo es plausible, pero se hizo desde local. La cifra que cuenta
es la de producción: se repetirá contra la API desplegada como parte de 001/T113. Detrás de Caddy
la cabecera `X-Forwarded-For` se reemplaza y la cuota se aplica (10 por hora y 50 al día por
herramienta), así que allí se ejecuta con `--limit 10`: diez muestras por herramienta, una cifra
orientativa que hay que registrar como tal.

## SC-003 — HTTP Headers frente a curl

Ejecución del 2026-11-13 (`2026-11-13T02:58:35Z`), con la comprobación de estabilidad del
script y la corrección del falso positivo de google.com (ver el análisis). A cada sitio que
difiere se le repite la petición desde URLkit y desde curl, y se excluye solo si cumple una de las
causas de SC-003 (spec, Clarifications 2026-11-12). La ejecución del 2026-11-12 dio 46/49 de los
comparables, con las causas deducidas a mano.

| URL | Estado (URLkit / curl) | Cabeceras comunes | Resultado |
| --- | --- | --- | --- |
| https://www.google.com/ | 200 / 200 | 100 % | coincide |
| https://www.wikipedia.org/ | 200 / 200 | 100 % | coincide |
| https://github.com/ | 200 / 200 | 100 % | coincide |
| https://www.mozilla.org/ | 200 / 200 | 100 % | coincide |
| https://www.apple.com/ | 200 / 200 | 100 % | coincide |
| https://www.microsoft.com/ | 200 / 200 | 100 % | coincide |
| https://www.cloudflare.com/ | 200 / 200 | 100 % | coincide |
| https://www.amazon.com/ | 200 / 200 | 100 % | coincide |
| https://www.bbc.co.uk/ | 200 / 200 | 100 % | coincide |
| https://www.nytimes.com/ | 200 / 403 | 74 % | excluido: estado distinto según el cliente |
| https://elpais.com/ | 200 / 200 | 100 % | coincide |
| https://www.rtve.es/ | 200 / 200 | 100 % | coincide |
| https://www.gov.uk/ | 200 / 200 | 100 % | coincide |
| https://european-union.europa.eu/ | 200 / 200 | 100 % | coincide |
| https://www.w3.org/ | 200 / 200 | 100 % | coincide |
| https://www.ietf.org/ | 200 / 200 | 100 % | coincide |
| https://www.python.org/ | 200 / 200 | 100 % | coincide |
| https://nodejs.org/ | 200 / 200 | 100 % | coincide |
| https://www.npmjs.com/ | 403 / 403 | 100 % | coincide |
| https://stackoverflow.com/ | 403 / 403 | 100 % | coincide |
| https://www.reddit.com/ | 200 / 200 | 100 % | coincide |
| https://duckduckgo.com/ | 200 / 200 | 100 % | coincide |
| https://www.bing.com/ | 200 / 200 | 100 % | coincide |
| https://www.yahoo.com/ | 200 / 200 | 100 % | coincide |
| https://www.linkedin.com/ | 403 / 403 | 100 % | coincide |
| https://x.com/ | 200 / 200 | 100 % | coincide |
| https://www.facebook.com/ | 200 / 200 | 95 % | coincide |
| https://www.instagram.com/ | 200 / 200 | 100 % | coincide |
| https://www.youtube.com/ | 200 / 200 | 100 % | coincide |
| https://www.netflix.com/ | 200 / 200 | 100 % | coincide |
| https://open.spotify.com/ | 200 / 200 | 100 % | coincide |
| https://www.paypal.com/ | 403 / 403 | 100 % | coincide |
| https://stripe.com/ | 200 / 200 | 100 % | coincide |
| https://www.shopify.com/ | 200 / 200 | 100 % | coincide |
| https://wordpress.org/ | 200 / 200 | 100 % | coincide |
| https://www.debian.org/ | 200 / 200 | 100 % | coincide |
| https://ubuntu.com/ | 200 / 200 | 100 % | coincide |
| https://archlinux.org/ | 200 / 200 | 100 % | coincide |
| https://www.kernel.org/ | 200 / 200 | 100 % | coincide |
| https://www.gnu.org/ | inspect.timeout / error | — | excluido: no contesta |
| https://letsencrypt.org/ | 200 / 200 | 100 % | coincide |
| https://www.eff.org/ | 200 / 200 | 100 % | coincide |
| https://www.theguardian.com/ | 200 / 200 | 100 % | coincide |
| https://www.lemonde.fr/ | 200 / 200 | 100 % | coincide |
| https://www.spiegel.de/ | 200 / 200 | 100 % | coincide |
| https://edition.cnn.com/ | 200 / 200 | 100 % | coincide |
| https://www.reuters.com/ | 401 / 401 | 100 % | coincide |
| https://apnews.com/ | 403 / 403 | 100 % | coincide |
| https://www.bloomberg.com/ | 403 / 403 | 100 % | coincide |
| https://www.dropbox.com/ | 200 / 200 | 100 % | coincide |

Coinciden: **48/48 (100 %)** de los sitios estables (objetivo: 100 %). Excluidos: 2 de 50 (4 %; límite: 10 %).

## SC-003 — Evaluación de las cabeceras de seguridad (segunda mitad)

**Resultado: 411/412 (99,8 %)** de las comprobaciones (6 cabeceras de 50 sitios y 115 cookies;
3 cookies sin datos), puntuado con `--score` sobre
[`sc003-review-2026-11-12.csv`](./sc003-review-2026-11-12.csv), que guarda el juicio de cada fila
y su origen. Instantáneas en `apps/api/scripts/out/2026-11-12-sc003/` (ignoradas por git).

Cómo se hizo la revisión:

1. Las instantáneas se repitieron con las cookies conservando nombre y atributos (solo se omite el
   valor); antes se omitía la línea entera y no había nada que juzgar.
2. Un evaluador independiente en Python aplicó la rúbrica (criterios de
   `packages/rules/data/security/headers.json`, reglas de la spec y de research R3) a la
   instantánea de URLkit, con las mismas cabeceras que URLkit evaluó, de modo que se compara la
   lógica y no la variabilidad del servidor. Las cookies salen de la copia de curl tomada a la vez,
   la única con atributos. Coincidió con URLkit en las 412 filas comparables.
3. Como las dos implementaciones podían compartir un error de interpretación, Claude revisó a mano,
   sobre las cabeceras crudas, los casos delicados: CSP con *nonce* o *hash* (17 sitios), con
   `strict-dynamic` (4), solo *report-only* (3), `Referrer-Policy` con lista, `X-Frame-Options`
   con valores raros, las 6 HSTS mal configuradas y una muestra de cookies.

Lo que encontró la revisión a mano:

| Sitio | Hallazgo | Efecto en el resultado |
| --- | --- | --- |
| `https://www.eff.org/` | `X-Frame-Options: SAMEORIGIN, SAMEORIGIN` vale como `SAMEORIGIN` según el estándar HTML (si todos los valores de la lista son iguales, cuenta ese valor). URLkit la marca como mal configurada: **fallo de URLkit** | El único desacuerdo |
| `https://www.youtube.com/` | `script-src … 'strict-dynamic' https: http: 'unsafe-eval'`: el estado *mal configurada* es correcto por `'unsafe-eval'`, pero el aviso `headers.csp.unsafe-source` (`http:`) sobra, porque con `strict-dynamic` el navegador ignora las fuentes de host y de esquema (CSP3): **falso positivo de URLkit** a nivel de aviso | Ninguno: el estado coincide |

**Los dos fallos están corregidos** en `packages/core/src/tools/headers/analyze.ts`, con pruebas en
`packages/core/tests/unit/headers.test.ts`: `X-Frame-Options` se lee como lista y vale si todos sus
valores son iguales, y con `'strict-dynamic'` se ignoran las fuentes de host y de esquema y
`'unsafe-inline'`. Reevaluadas con el código corregido las mismas instantáneas de URLkit, solo cambia
el estado de eff.org (*mal configurada* → *presente*) y el acuerdo queda en **412/412 (100 %)**. El
CSV guardado conserva los estados de URLkit anteriores a la corrección, para que se vea el
desacuerdo que motivó el cambio.

El resto de casos delicados se evaluó bien: `'unsafe-inline'` ignorado junto a un *nonce*, *report-only*
contado como ausente, la última política válida de `Referrer-Policy`, y HSTS de menos de un año
(180 días en w3.org, facebook.com, shopify.com y debian.org; 3600 s en wordpress.org).

Límites:

- **No es una revisión humana**: es una segunda implementación más una revisión hecha por Claude.
  Conviene que una persona revise una muestra antes de dar SC-003 por cumplido.
- Mide la rúbrica tal como está escrita. Si la rúbrica cambia (por ejemplo, el umbral de HSTS), el
  resultado deja de valer.

## SC-004 — Metadata

50 páginas elegidas por los casos que cubren (campo `case` en `apps/api/scripts/reference-sets.json`):
Open Graph completo y parcial, solo tarjeta de redes, solo etiquetas básicas o nada, aplicaciones
de una sola página, ocho codificaciones distintas de UTF-8 (Shift_JIS, KOI8-R, GBK, ISO-8859-15,
windows-1252 y sin declarar), canónica en otro dominio, redirecciones y documentos de más de 1 MiB.
Cuatro campos por página: título, descripción, imagen y canónica.

**Resultado: 200/200 (100 %)**, puntuado con `--score` sobre `sc004-review.csv` y las instantáneas
del 2026-11-12.

Cómo se obtuvieron los valores esperados:

1. Un extractor independiente en Python (`html.parser`, sin código compartido con URLkit) leyó las
   instantáneas, las decodificó y aplicó la regla documentada: Open Graph, después tarjeta de
   redes y después HTML básico para título y descripción; Open Graph y después tarjeta de redes
   para la imagen; `<link rel=canonical>` para la canónica.
2. Coincidió con URLkit en 195 de los 200 campos. Las 5 diferencias eran canónicas escritas sin
   barra final (`https://www.theguardian.com`), que URLkit serializa como
   `https://www.theguardian.com/` según el estándar URL de WHATWG (Principio II): es la misma URL, y
   se dio por buena la forma del estándar.
3. Claude revisó a mano, sobre el HTML, los casos donde las dos implementaciones podrían
   equivocarse igual: las ocho codificaciones (títulos en japonés, ruso y chino legibles), la
   página con marcos, la ausencia de `<title>` en danluu.com, el `<title>` dentro de `<body>` de
   info.cern.ch, AMP, el proxy de Google Translate y los dos documentos truncados.

Límites de este resultado:

- **No es una revisión humana.** Es una comparación con una segunda implementación más una revisión
  hecha por Claude. Antes de dar SC-004 por cumplido conviene que una persona revise una muestra
  (por ejemplo 10 páginas, 40 campos) sobre las mismas instantáneas.
- **No cubre dos casos** que no aparecieron en páginas reales: varias `og:image` y `og:image`
  relativa. Los cubren las pruebas unitarias de `packages/core/tests/unit/metadata.test.ts`.
- **Vale para las instantáneas de ese día.** Al repetir el script, las páginas vivas pueden haber
  cambiado (las portadas de prensa cambian a diario), y entonces la comparación con los valores
  guardados mide el cambio de la página, no la herramienta.

## SC-005 — TLS con badssl.com

| Host | Esperado | Obtenido | Resultado |
| --- | --- | --- | --- |
| sha256.badssl.com | trusted | trusted | correcto |
| expired.badssl.com | tls.expired | tls.expired | correcto |
| self-signed.badssl.com | tls.self-signed | tls.self-signed | correcto |
| wrong.host.badssl.com | tls.name-mismatch | tls.name-mismatch | correcto |
| untrusted-root.badssl.com | tls.self-signed | tls.self-signed | correcto |
| incomplete-chain.badssl.com | tls.incomplete-chain | tls.incomplete-chain | correcto |

Detectados: **6/6 (100 %)** (objetivo: 100 %).

## SC-006 — Estado DNSSEC

| Dominio | Esperado | Obtenido | Resolutor | Resultado |
| --- | --- | --- | --- | --- |
| dnssec-failed.org | {"dnssec":"bogus"} | {"dnssec":"bogus","outcome":"exists"} | cloudflare | correcto |
| cloudflare.com | {"dnssec":"validated"} | {"dnssec":"validated","outcome":"exists"} | cloudflare | correcto |
| ietf.org | {"dnssec":"validated"} | {"dnssec":"validated","outcome":"exists"} | cloudflare | correcto |
| example.com | {"dnssec":"validated"} | {"dnssec":"validated","outcome":"exists"} | cloudflare | correcto |
| google.com | {"dnssec":"unsigned"} | {"dnssec":"unsigned","outcome":"exists"} | cloudflare | correcto |
| github.com | {"dnssec":"unsigned"} | {"dnssec":"unsigned","outcome":"exists"} | cloudflare | correcto |
| urlkit-reference-no-existe-7f3a9c.com | {"outcome":"nxdomain"} | {"dnssec":"unsigned","outcome":"nxdomain"} | cloudflare | correcto |

Correctos: **7/7 (100 %)** (objetivo: 100 %).


## Análisis de las diferencias de SC-003

Historial de ejecuciones de este script, el mismo día:

| Ejecución | Resultado | Qué cambió |
| --- | --- | --- |
| 1 | 0/49 | **Fallo de la v2**: con HTTP/2, undici entrega las cabeceras como objeto y no como lista, y HTTP Headers devolvía la lista vacía |
| 2 | 45/49 | Corregido (`headerPairs` en `apps/api/src/inspect/safe-fetch.ts`, prueba en `tests/integration/raw-headers.test.ts`). Aparecen dos **fallos del MVP** en Redirect Inspector, cuya cadena reutiliza HTTP Headers (ver abajo) |
| 3 (esta) | 46/49 | Corregidos los dos fallos del MVP. ubuntu.com y duckduckgo.com coinciden ahora con curl |

Las diferencias que quedan en esta ejecución se deben a los servidores, no a la herramienta. Con la
redacción de SC-003 precisada el 2026-11-12 (spec, Clarifications), son los sitios que no responden
de forma estable y quedan fuera del cálculo. La tabla siguiente es la de la ejecución del
2026-11-12, con las causas deducidas a mano; la del 2026-11-13, con la comprobación automática, la
corrige en google.com (ver debajo).

| URL | Causa |
| --- | --- |
| `https://www.nytimes.com/` | El servidor responde 200 a URLkit y 403 a curl con el mismo `User-Agent`: protección contra bots que distingue clientes |
| `https://www.google.com/`, `https://www.linkedin.com/` | Mismo estado; las cabeceras cambian entre dos peticiones seguidas (experimentos, consentimiento, enrutado). En otras ejecuciones LinkedIn coincidió |
| `https://www.gnu.org/` | No respondió en 15 s ni a URLkit ni a curl |

La comprobación automática del 2026-11-13 confirma nytimes.com (estado distinto según el cliente)
y gnu.org (no contesta). LinkedIn coincidió. **google.com no era inestable**: URLkit y curl
repiten cada uno su respuesta, pero URLkit no acaba en la misma página. Redirect Inspector, cuya
cadena reutiliza HTTP Headers, toma por redirección al cargar la página este código de la
portada:

```js
document.getElementById(id).onclick = function () { … else top.location = '/doodles/'; };
```

La asignación está dentro del `onclick` del botón «Voy a tener suerte» y solo se ejecuta al
pulsarlo. URLkit la sigue hasta `https://doodles.google/` y compara sus cabeceras con las de la
portada. Es un fallo de `detectJsRedirect` en `packages/core/src/tools/inspect/logic.ts`, de la
misma familia que el de ubuntu.com: afecta a Redirect Inspector, HTTP Headers, Metadata y Security
Analysis con cualquier URL de google.com. Corregido el 2026-11-13: una asignación dentro de un
manejador de evento (`onclick`, `addEventListener`, `.on("click", …)`) ya no cuenta como
redirección. La prueba está en `packages/core/tests/unit/inspect.test.ts` y la regla, en
`specs/001-mvp-url-toolkit/data-model.md` (RedirectChain). La portada conserva una redirección
calculada real, dentro de una condición para navegadores antiguos
(`setTimeout(function(){location.href=f},0)`); se informa sin seguirla, como manda la spec, y la
cadena termina en la portada. Con la corrección, SC-003 da 48/48.

En esa misma ejecución, SC-005 dio 4/6 (`self-signed.badssl.com` sin resolver y un fallo de
negociación en `untrusted-root.badssl.com`). Repetidos tres veces cada uno, los dos devolvieron
`tls.self-signed`, como se espera. Al preparar 002/T098b se vio que los fallos de negociación no
son de la red: la sonda TLS envía una clave poscuántica que badssl.com corta a ratos
(`validation/usability.md`, «Ensayo previo»). Corregido el 2026-11-12: la sonda reintenta con
curvas clásicas cuando el servidor corta la negociación, y el cliente HTTP también. Repetido el
script con las dos correcciones: SC-003 47/47 de los sitios estables (3 de 50 excluidos; esta vez
ubuntu.com no contestó a curl) y SC-005 6/6. SC-004 se compara contra los valores
esperados de las instantáneas del 2026-11-12 y las páginas vivas ya han cambiado, así que su
resultado sigue siendo el de esas instantáneas.

Entre ejecuciones también aparecieron fallos pasajeros de red (un `inspect.network` en
facebook.com, un fallo en un host de badssl.com) que desaparecieron al repetir sin cambiar nada.

### Los dos fallos del MVP, corregidos

| URL | Causa | Corrección |
| --- | --- | --- |
| `https://ubuntu.com/` | `detectJsRedirect` buscaba `location=` en todo el HTML y tomó el atributo `data-form-location="/shared/forms/form-template"` por una asignación de JavaScript; seguía hasta un 404 | Solo se busca en el contenido de los `<script>` ejecutables |
| `https://duckduckgo.com/` | `<noscript><meta http-equiv="refresh" content="0; url=&quot;…&quot;"></noscript>`: no se decodificaban las entidades y se seguía a una URL con `&quot;` dentro (410) | Se decodifican las entidades del `content`, y un `meta refresh` dentro de `<noscript>` no se sigue, porque un navegador con scripts no lo aplica |

Ambas en `packages/core/src/tools/inspect/logic.ts`, con pruebas en
`packages/core/tests/unit/inspect.test.ts` y el comportamiento descrito en
`specs/001-mvp-url-toolkit/data-model.md` (RedirectChain).

En SC-006, el primer dominio inexistente elegido (`…example.org`) respondía `NOERROR` sin datos
en lugar de `NXDOMAIN`, como hacen a propósito algunos servidores autoritativos firmados ("black
lies"). La herramienta informa lo que dice el DNS; el caso se cambió por un `.com` inexistente.

Pendiente, fuera de este script:

- SC-003, segunda mitad: que una persona revise una muestra.
- SC-004: que una persona revise una muestra de los valores esperados (ver la sección de SC-004).

Las dos hojas están preparadas (ver «Muestra humana de SC-003 y SC-004»).

## Muestra humana de SC-003 y SC-004

**Estado**: preparada el 2026-11-12, pendiente de que una persona la rellene. Las dos muestras salen
de las instantáneas del 2026-11-12, que son las mismas que se evaluaron. Están ignoradas por git:
quien revise necesita la copia local de `apps/api/scripts/out/`. La semilla es fija (`20261112`),
así que la selección es reproducible.

### SC-003: [`sc003-sample-2026-11-12.csv`](./sc003-sample-2026-11-12.csv)

40 filas: 6 por cabecera (las seis comprobaciones de seguridad) y 4 cookies. Es una muestra
estratificada que sobrerrepresenta a propósito el estado *mal configurada*, que es donde se
esconden los errores. Quedan 16 *presente*, 15 *ausente*, 5 *mal configurada* y 4 cookies (2 *ok*,
2 con problemas).

Es una revisión **a ciegas**: la hoja no muestra el estado de URLkit. Cada fila da la ruta de la
instantánea, con los números de línea, y las líneas que importan (`evidence`; si la cabecera no
está, lo dice). Hay que escribir en `reviewer_state` uno de estos valores:

| Valor | Cuándo |
| --- | --- |
| `present` | La cabecera está y su valor cumple la rúbrica |
| `missing` | La cabecera no está. Una CSP solo en modo `report-only` cuenta como ausente |
| `misconfigured` | La cabecera está, pero su valor no cumple la rúbrica |
| `ok` | Cookie: tiene `HttpOnly` y, en un sitio `https` o si lleva `SameSite=None`, también `Secure` |
| `issues` | Cookie: le falta alguno de esos atributos |

La rúbrica, resumida de `packages/rules/data/security/headers.json` (la hoja de referencia):

- **HSTS**: `max-age` de al menos 31536000 (un año).
- **CSP**: `script-src` (o `default-src`) restringe los scripts sin `'unsafe-inline'`,
  `'unsafe-eval'`, `*`, `data:` ni `http:`. `'unsafe-inline'` no cuenta junto a un *nonce* o un
  *hash*, y con `'strict-dynamic'` se ignoran las fuentes de host y de esquema.
- **X-Frame-Options**: `DENY` o `SAMEORIGIN`, también como lista de valores iguales. Una CSP con
  `frame-ancestors` la sustituye y cuenta como *present*.
- **X-Content-Type-Options**: exactamente `nosniff`.
- **Referrer-Policy**: una política válida; `unsafe-url` cuenta como *misconfigured*.
- **Permissions-Policy**: basta con que esté.

### SC-004: [`sc004-sample-2026-11-12.csv`](./sc004-sample-2026-11-12.csv)

10 páginas al azar con sus cuatro campos (título, descripción, imagen y canónica): 40 filas. Esta
revisión es **de confirmación**: la hoja muestra el valor de URLkit (`urlkit_value`), porque
escribir a ciegas descripciones largas sería lento y daría errores de copia. Para cada fila hay
que abrir la instantánea (`snapshot`) y escribir en `expected` `ok` si el valor es correcto
(también cuando está vacío porque la página no declara nada), o el valor correcto si no lo es. La
regla: Open Graph, después tarjeta de redes y después HTML básico para título y descripción; Open
Graph y después tarjeta de redes para la imagen; `<link rel=canonical>` para la canónica. Al
azar no salió ninguna de las ocho codificaciones distintas de UTF-8; esas ya las revisó Claude a
mano (ver la sección de SC-004).

### Cómo se puntúan

Se fusiona cada hoja con los valores de URLkit y se pasa por
`node apps/api/scripts/reference-check.ts --score`:

- **SC-003**: el estado de URLkit sale de `sc003-review-2026-11-12.csv`. Para eff.org
  `x-frame-options` se usa `present`, el estado tras la corrección del 2026-11-12.
- **SC-004**: un `ok` toma el valor de URLkit como esperado (`—` si está vacío).

Objetivo: el 95 % o más en cada una. Cualquier desacuerdo se investiga como un posible fallo
antes de puntuar.
