# Privacidad: qué se guarda, qué no y por qué

**Estado**: vigente | **Fecha**: 2026-11-11

Este documento describe los compromisos de privacidad del producto y cómo se materializan. No es
un texto legal: es la descripción técnica que cualquier persona puede verificar y que el equipo
está obligado a cumplir (Principio V de la [constitución](../.specify/memory/constitution.md)).

## El compromiso, en una frase

Las URLs que escribes no se almacenan en ningún sitio, y en las cuatro herramientas locales no
llegan siquiera a salir de tu navegador.

## Dónde se procesa cada herramienta

| Herramienta | Tu URL sale del navegador | Por qué |
|---|---|---|
| Smart Cleaner | **No** | La limpieza es cálculo local; el catálogo de reglas se descarga una vez |
| URL Parser | **No** | Análisis local con el analizador del propio navegador |
| URL Diff | **No** | Comparación local |
| Explain URL | **No** | Reglas fijas, sin IA, ejecutadas localmente |
| Redirect Inspector | **Sí** | Alguien tiene que seguir los saltos; si lo hiciera tu navegador, visitarías cada destino |
| HTTP Headers | **Sí** | Hay que pedir la página para ver qué responde el servidor |
| Metadata | **Sí** | Hay que leer el documento para extraer sus metadatos |
| TLS | **Sí** | Hay que conectarse al servidor para ver su certificado |
| DNS | **Sí** (solo el nombre) | Hay que preguntar a un resolutor; de una URL solo se usa el host |
| Security Analysis | **Sí** | Reúne las cuatro anteriores y Explain URL |

Que las cuatro primeras sean locales no es una optimización: es el motivo por el que el producto
puede ser gratuito, instantáneo y privado a la vez.

### Qué gana Redirect Inspector siendo remoto

Al seguir la cadena desde nuestro servidor, el sitio de destino **no ve tu dirección IP, tu
navegador ni tus cookies**: ve nuestra petición. Es una ventaja de privacidad, no una concesión.
A cambio, esa URL sí llega a nuestro servidor, y sobre eso aplica todo lo que sigue.

### Las herramientas de análisis técnico

HTTP Headers, Metadata, TLS, DNS y Security Analysis funcionan igual: la petición la hace nuestro
servidor, nunca tu navegador, y se aplican las mismas reglas que a Redirect Inspector. En
concreto:

- **HTTP Headers** pide la página y te devuelve sus cabeceras. Los **valores de las cookies no se
  devuelven nunca**: ves el nombre de cada cookie y sus atributos, y su valor aparece como
  `<omitido>`.
- **Metadata** lee como máximo 1 MiB del documento y no ejecuta nada de él. La imagen de vista
  previa y los iconos se te muestran como direcciones de texto: **tu navegador no los descarga**,
  así que su servidor no recibe tu IP.
- **TLS** se conecta al servidor, completa la negociación del cifrado y cierra sin pedir nada más.
- **DNS** pregunta por el nombre a dos resolutores públicos que validan DNSSEC: **Cloudflare**
  (`1.1.1.1`) y, si no responde, **Quad9** (`9.9.9.9`). El resolutor ve el nombre consultado, pero
  llega desde la IP de nuestro servidor, **nunca desde la tuya**. No puedes elegir otro resolutor.
- **Security Analysis** hace todo lo anterior sobre el destino final del enlace, con una sola
  petición tuya y un solo uso de su límite.

Ninguna de ellas guarda el resultado: ni en una base de datos, ni en una caché, ni en los
registros.

## Qué no se guarda nunca

- **Las URLs enviadas.** No hay base de datos en la que puedan estar: el MVP no tiene
  persistencia. Y cuando llegue (v3, para historial e informes), guardar algo requerirá que tú lo
  pidas explícitamente.
- **Las URLs en los registros.** Los registros estructurados del servidor excluyen por
  construcción los campos de URL, consulta y dirección IP. No es una política: es un filtro en el
  propio registrador, con una prueba que lo verifica.
- **Las trazas con contenido.** Las trazas de operación llevan como máximo el dominio registrable
  del destino, nunca la ruta, la consulta ni el fragmento.
- **Nada en el servicio de errores.** Una prueba comprueba que ningún campo de entrada llega al
  servicio de errores.

## Cookies e identificadores

**No se usan cookies.** Ninguna, tampoco técnicas. No hay banner de consentimiento porque no hay
nada que consentir.

**No hay identificadores de visitante.** No se asigna ni se almacena ningún identificador
persistente, ni en el navegador ni en el servidor.

Lo único que se guarda en tu navegador es la preferencia de "limpieza máxima", en
`localStorage`, para que no tengas que volver a activarla. Vive solo en tu dispositivo, no se
envía a ningún sitio y el producto funciona igual si la bloqueas.

## Los límites de uso y la seudonimización

Redirect Inspector y cada herramienta de análisis técnico tienen su propio límite gratuito (10 usos
por hora y 50 al día cada una), que hay que poder contar sin identificar a nadie. Agotar una no
bloquea las demás. Se resuelve así:

1. De tu dirección IP se calcula un **hash con clave** (HMAC-SHA256). En IPv6 se reduce primero al
   prefijo `/64`.
2. **La clave rota cada día.** El seudónimo de hoy no se puede relacionar con el de ayer.
3. El contador vive **solo durante su ventana** (la hora o el día en curso) y caduca solo.
4. La dirección IP original no se almacena en ningún momento.

Consecuencia honesta: si compartes red con mucha gente —una oficina, una universidad, una VPN—
compartís el contador. El mensaje de límite lo explica, y las cuatro herramientas locales siguen
funcionando sin límite porque no pasan por el servidor. Si los resolutores DNS no responden, esa
consulta no cuenta para tu límite.

## Qué se mide

Solo contadores agregados, sin etiquetas que permitan distinguir visitantes:

- Usos por herramienta y resultado: `éxito`, `error`, resultado copiado o resultado enviado a
  otra herramienta.
- Errores por herramienta y código.
- Duración de las inspecciones.

La web envía un único evento mínimo `{herramienta, resultado}` con una petición `fetch` que sigue
adelante aunque cierres la página (`keepalive`). No lleva la URL, ni identificador, ni cookie, ni
referente. No hay analítica de terceros de ningún tipo.

## Enlaces compartibles

Cuando compartes el enlace a un resultado, la URL viaja en el **fragmento** de la dirección
(`/es/clean#u=...`). Los fragmentos no se envían al servidor por diseño del protocolo, así que ese
enlace no deja rastro en nuestros registros ni en los del CDN.

Lo que sí ocurre: **quien reciba el enlace verá la URL**. La interfaz te lo advierte antes de
copiarlo.

## Lo que no podemos evitar, dicho claramente

- **Las conexiones tienen una IP de origen.** El CDN que sirve la web y el servidor de la API ven
  tu dirección IP en el momento de la conexión, porque sin ella no hay respuesta posible. No se
  almacena ni se registra; para los contadores se usa el seudónimo descrito arriba.
- **El proveedor de infraestructura existe.** La web se sirve desde un CDN y la API desde un
  servidor alquilado. El CDN puede mantener sus propios registros operativos, sobre los que aplica
  sus políticas y no las nuestras. En el servidor, el cifrado termina en nuestro propio proxy, así
  que su proveedor ve el tráfico pero no su contenido. Cuáles son y qué registran está en
  [Proveedores y qué registran](#proveedores-y-qué-registran).
- **El sitio que inspeccionas o analizas sabe que alguien lo hizo.** Verá una petición o una
  conexión de nuestro servicio, con un `User-Agent` identificable cuando es una petición web. No
  sabrá quién la pidió.
- **Los resolutores DNS ven el nombre que consultas.** Lo reciben de nuestro servidor, no de ti, y
  sin nada que te identifique.

## Proveedores y qué registran

> **Borrador (T114).** Se completa al desplegar (T111 y T112). Lo marcado como _por confirmar_
> todavía no es un compromiso.

| Pieza | Quién | Qué recibe de tu visita | Qué registra |
|---|---|---|---|
| Web: páginas, código y catálogo de reglas | Cloudflare Pages | Tu IP, tu navegador y la página que abres (`/es/clean`). Nunca la URL que escribes: no sale del navegador, y en un enlace compartido va en el fragmento | _Por confirmar_: qué registra Cloudflare de las visitas a Pages y cuánto tiempo lo guarda. No activamos Web Analytics, Bot Fight Mode ni Zaraz |
| Servidor de la API | Proveedor de VPS _por elegir_ (candidato: Hetzner Cloud, en la UE) | Tráfico cifrado: IPs, puertos y volumen. No ve rutas, consultas ni la URL que inspeccionas, porque el cifrado termina en nuestro Caddy | _Por confirmar_: qué registros de red guarda el proveedor |
| Proxy TLS | Caddy, en nuestro servidor | La petición completa | Nada de la petición. No hay registro de accesos, y los errores llevan solo mensaje, estado y duración (comprobado el 2026-11-10) |
| Contadores de cuota | Valkey, en nuestro servidor | El seudónimo del día | El contador, que caduca con su ventana |
| DNS de la API | _Por elegir_. Si es Cloudflare, en modo «solo DNS» | Las consultas por el nombre de la API, que normalmente hace tu resolvedor y no tu dispositivo | _Por confirmar_ |
| Resolutores de la herramienta DNS | Cloudflare (`1.1.1.1`) y Quad9 (`9.9.9.9`), por DNS sobre HTTPS | El nombre que consultas, desde la IP de nuestro servidor. Nunca tu IP ni la URL completa | Lo que establezcan las políticas de privacidad de sus servicios públicos de resolución |
| Certificado TLS | La autoridad que usa Caddy (Let's Encrypt por defecto) | Nada de tus visitas: solo el nombre de la API al emitir el certificado | — |
| Errores (opcional) | _Por decidir_ si se activa Sentry | Errores sin campos de entrada, depurados antes de enviarse | Lo que establezca su política, si se activa |
| Trazas (opcional) | _Por decidir_ si se activa un destino OTLP | Trazas con, como mucho, el dominio registrable del destino | Lo que establezca su política, si se activa |

El repositorio y el build de la web están en GitHub y Cloudflare; ninguno de los dos recibe datos
de quien visita la web.

Antes de quitar la marca de borrador:

- Elegir el proveedor del VPS y enlazar su política de privacidad.
- Confirmar con la documentación de Cloudflare qué registra de las visitas a Pages y del DNS.
- Decidir si se activan Sentry y OTLP; si no, quitar sus filas.
- Actualizar la fecha de la cabecera.

## Cómo verificarlo

- Abre las herramientas de red de tu navegador y usa el limpiador, el analizador, el comparador o
  la explicación: **no verás ninguna petición** con tu URL.
- Usa una herramienta de análisis técnico: verás **una sola petición**, un `POST` a la API con la
  URL en el cuerpo. Ninguna va a terceros, tampoco a la imagen de vista previa.
- Revisa el almacenamiento: no hay cookies.
- El código es el que está en este repositorio, y las garantías anteriores tienen pruebas
  automáticas que bloquean la integración si fallan.

## Qué cambiará en las próximas versiones

- **v2** (HTTP Headers, Metadata, TLS, DNS y Security Analysis): ya disponible. Lo que llega al
  servidor con cada una está descrito arriba, en "Las herramientas de análisis técnico".
- **v3** (cuentas, historial, informes): guardar algo será **opcional y explícito**. Tener cuenta
  no cambiará el funcionamiento de las herramientas gratuitas, y seguirán usándose sin cuenta.

Cualquier cambio en este documento se hace junto al cambio de código que lo motiva, nunca después.
