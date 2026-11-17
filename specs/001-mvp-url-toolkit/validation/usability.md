# Prueba de usabilidad de Explain URL (SC-007)

**Estado**: pendiente de ejecutar con personas. No se ha realizado todavía.

**Criterio**: el 90 % o más de participantes no técnicos identifican correctamente el dominio real
de una URL engañosa usando Explain URL.

## Protocolo propuesto

- **Participantes**: 10 personas sin perfil técnico (no trabajan en desarrollo, sistemas ni
  seguridad). Mitad en español y mitad en inglés.
- **Material**: `/es/explain` o `/en/explain` en un móvil de 360 px y en un portátil.
- **Tarea**: para cada una de las cinco URLs siguientes, abrir el enlace compartible y responder
  «¿a qué sitio te llevaría este enlace?». Sin ayuda del moderador.

| # | URL | Dominio real esperado |
|---|---|---|
| 1 | `https://paypal.com@ejemplo-malo.xyz/login` | `ejemplo-malo.xyz` |
| 2 | `https://www.banco.example.secure-login.xyz/acceso` | `secure-login.xyz` |
| 3 | `https://аррӏе.com/` (cirílico) | `xn--80ak6aa92e.com`, no apple.com |
| 4 | `https://login.microsoftonline.example.com.evil.top/` | `evil.top` |
| 5 | `https://www.google.com/url?q=https%3A%2F%2Fejemplo-malo.xyz` | `google.com` (con aviso de URL anidada) |

- **Registro**: acierto o fallo por URL, tiempo hasta responder y comentarios literales.
- **Éxito**: al menos 9 de 10 participantes aciertan las URLs 1 a 4.
- **Sesión**: se hace junto con la prueba de Security Analysis de la v2, con los mismos
  participantes (`specs/002-v2-network-analysis/validation/usability.md`, «Sesión conjunta»). El
  guion del día, la preparación y la hoja de resultados están en
  [`session-day.md`](../../002-v2-network-analysis/validation/session-day.md).

## Ensayo previo sin participantes (2026-11-12)

Comprueba que el material de la prueba funciona, no la usabilidad. Las cinco URLs se abrieron con
sus enlaces compartibles en `pnpm dev`, en español y en inglés, a 360 px y en escritorio.

Enlaces para la sesión (anteponer el origen, por ejemplo `http://localhost:4321`; en inglés,
cambiar `/es/` por `/en/`):

| # | Enlace |
|---|---|
| 1 | `/es/explain#u=https%3A%2F%2Fpaypal.com%40ejemplo-malo.xyz%2Flogin` |
| 2 | `/es/explain#u=https%3A%2F%2Fwww.banco.example.secure-login.xyz%2Facceso` |
| 3 | `/es/explain#u=https%3A%2F%2F%D0%B0%D1%80%D1%80%D3%8F%D0%B5.com%2F` |
| 4 | `/es/explain#u=https%3A%2F%2Flogin.microsoftonline.example.com.evil.top%2F` |
| 5 | `/es/explain#u=https%3A%2F%2Fwww.google.com%2Furl%3Fq%3Dhttps%253A%252F%252Fejemplo-malo.xyz` |

Lo que muestra la tarjeta «Sitio real» y los avisos:

| # | «Sitio real» (resaltado) | Avisos | ¿Coincide con lo esperado? |
|---|---|---|---|
| 1 | `ejemplo-malo.xyz` | Atención: lo anterior a `@` no es el destino. Información: `.xyz` | Sí |
| 2 | `www.banco.example.` atenuado, `secure-login.xyz` resaltado | Información: `.xyz` | Sí |
| 3 | `xn--80ak6aa92e.com` resaltado; debajo, atenuado, «Se ve como: аррӏе.com» | Atención: letras de otro alfabeto, forma real `xn--80ak6aa92e.com` | Sí, tras el cambio de la tarjeta (ver observaciones) |
| 4 | `login.microsoftonline.example.com.` atenuado, `evil.top` resaltado | Información: `.top` | Sí |
| 5 | `www.` atenuado, `google.com` resaltado | Información: contiene otra URL, `https://ejemplo-malo.xyz` | Sí |

Resultado igual en los dos idiomas. A 360 px no hay desplazamiento horizontal y, en la 4, el
dominio resaltado baja a su propia línea.

Observaciones antes de la sesión:

- **URL 3**: en la primera pasada, lo que más destacaba en la tarjeta era la forma cirílica, que a
  la vista se lee «apple.com», con la forma real `xn--80ak6aa92e.com` debajo y atenuada. Si los
  participantes respondían «apple.com», el resultado mediría la jerarquía visual de la tarjeta, no
  la explicación. Se cambió `apps/web/src/islands/ExplainIsland.vue`: con un aviso `homograph` o
  `mixed-scripts`, la tarjeta resalta la forma ASCII y deja la Unicode como «Se ve como». Los
  dominios internacionales legítimos (`münchen.de`) siguen en Unicode. Lo cubren dos pruebas de
  `apps/web/tests/e2e/explain.spec.ts`. Repetido el ensayo en es y en a 360 px: correcto.
- **URLs 2 y 4**: la única pista, además del resaltado, es el aviso de terminación. No hay ningún
  aviso específico para una marca puesta en el subdominio.
- **URL 5**: tiene dos respuestas defendibles: `google.com`, adonde lleva el enlace, y
  `ejemplo-malo.xyz`, adonde acabaría redirigiendo. No entra en el criterio de éxito, así que se
  registra como informativa y cuentan las dos.

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

Personas (las mismas en la prueba de Security Analysis):

| Código | Idioma | Dispositivo | Perfil y cómo lee |
| --- | --- | --- | --- |
| A01 | es | móvil | 68 años, jubilada, usa poco más que WhatsApp; lee solo el texto grande |
| A02 | es | portátil | 45, administrativo; lee en diagonal y se fía de los colores |
| A03 | es | móvil | 19, estudiante; rápida, no se desplaza si cree que la respuesta ya está a la vista |
| A04 | es | portátil | 55, tiene una tienda; lee con calma y desconfía de las palabras en inglés |
| A05 | es | móvil | 33, enfermera; lee con prisa y mira antes los iconos y los avisos |
| A06 | en | portátil | 72, maestra jubilada; lo lee todo, despacio, y toma los términos técnicos al pie de la letra |
| A07 | en | móvil | 28, dependiente; mira solo la primera pantalla |
| A08 | en | portátil | 40, contable; metódico, pero no sabe qué es un certificado |
| A09 | en | móvil | 51, conductor; el inglés no es su lengua materna y le cuestan las frases largas |
| A10 | en | portátil | 23, diseñadora; visual, se fija en la maquetación y el resaltado |

| Part. | E1 | E2 | E3 | E4 | E5 (resp.) | Razonamiento |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | ✓ | ✗ | ✓ | ✗ | google.com | E2 «al banco» y E4 «a Microsoft»: la parte atenuada se sigue leyendo y contiene una palabra conocida; ningún aviso habla de la marca en el subdominio. E3: «unas letras raras, xn…, no es Apple» |
| A02 | ✓ | ✓ | ✓ | ✓ | google.com | Sigue el resaltado amarillo en las cinco |
| A03 | ✓ | ✓ | ✓ | ✓ | ejemplo-malo.xyz | En E5 lee «Contiene otra URL dentro» y responde el destino anidado (vale) |
| A04 | ✓ | ✓ | ✓ | ✓ | google.com | E3: responde por «Su forma real es xn--80ak6aa92e.com», pero comenta que más abajo «pone que el sitio real es apple.com» |
| A05 | ✓ | ✓ | ✓ | ✓ | google.com | Lee primero el recuadro «Atención» en E1 y E3 |
| A06 | ✓ | ✓ | ✗ | ✓ | google.com | E3: lo lee todo; en «Part by part», «Registrable domain аррӏе.com — The real site: …» le hace cambiar a «apple.com» |
| A07 | ✓ | ✓ | ✓ | ✓ | google.com | Solo la primera pantalla, pero la tarjeta «Real site» está en ella |
| A08 | ✓ | ✓ | ✓ | ✓ | google.com | E3: acierta y señala la contradicción entre la tarjeta y el desglose |
| A09 | ✓ | ✓ | ✗ | ✓ | google.com | E3: entiende «Looks like: apple.com» como «es apple.com» y responde Apple |
| A10 | ✓ | ✓ | ✓ | ✓ | google.com | Sigue el resaltado |

**Resultado simulado: 7 de 10 aciertan las URLs 1 a 4**, por debajo del criterio (9 de 10). Por
URL: E1 10/10, E2 9/10, E3 8/10, E4 9/10.

Hallazgos y propuestas. **Aplicadas el mismo día** la 1, la 2 y la 4 (001/T102a); la 3 sigue
abierta:

1. **E3: el desglose contradice a la tarjeta.** La tarjeta resalta `xn--80ak6aa92e.com`, pero
   «Parte por parte» muestra «Dominio registrable аррӏе.com» con la explicación «El sitio real:
   quien controla este dominio controla la página», que a la vista dice «apple.com». Propuesta:
   con un aviso `homograph` o `mixed-scripts`, mostrar también la forma ASCII en el desglose, como
   ya hace la tarjeta. **Aplicada**: el desglose muestra `xn--80ak6aa92e.com` en el host y el
   dominio registrable.
2. **E3: «Se ve como» / «Looks like» puede leerse como una equivalencia**, sobre todo en una
   lengua que no es la materna. Propuesta: un texto que diga que imita, por ejemplo «Imita a:
   apple.com» / «Imitates: apple.com». Es solo texto de `packages/i18n`. **Aplicada**: «Imita a:
   аррӏе.com» / "Imitates: аррӏе.com".
3. **E2 y E4: no hay aviso para una marca puesta en el subdominio**, como ya anotó el ensayo. Solo
   el resaltado separa la marca del dominio real. Un aviso nuevo sería un código nuevo del núcleo,
   así que primero iría a la spec.
4. **Un enlace compartible abierto en la misma pestaña no actualiza la página** si solo cambia lo
   que va tras `#`: se sigue viendo la URL anterior. En la sesión obliga a abrir cada enlace en una
   pestaña nueva (ya está en `session-day.md`). En el producto, la isla podría escuchar
   `hashchange`. **Aplicada**: la página se recarga cuando cambia el fragmento, salvo los enlaces
   dentro de la propia página.

## Resultados

| Participante | Idioma | 1 | 2 | 3 | 4 | 5 | Comentarios |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | Pendiente |
