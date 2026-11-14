# Privacidad: qué se guarda, qué no y por qué

**Estado**: vigente | **Fecha**: 2026-11-13

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

- **Las URLs enviadas.** La única base de datos guarda organizaciones con clave de API y sus
  recuentos de uso (ver "Claves de API para organizaciones"), y no tiene ninguna columna en la que
  pueda caber una URL. Cuando llegue el historial (v3), guardar algo requerirá que tú lo pidas
  explícitamente.
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

## Claves de API para organizaciones

Desde la v3, una organización puede usar la API con una clave que le da el equipo de URLkit, para
tener límites mayores que los anónimos. Sin clave, todo funciona como siempre y no se guarda nada.
La web no usa claves.

De una organización con clave se guarda **solo** esto:

| Dato | Para qué | Cuánto tiempo |
|---|---|---|
| Nombre y una nota interna del equipo | Saber de quién es cada clave | Mientras exista la organización |
| Plan asignado y estado (activa o desactivada) | Aplicar sus límites | Mientras exista la organización |
| Resumen SHA-256 de cada clave, su identificador corto y sus fechas | Comprobar la clave en cada petición, sin poder reconstruirla | Mientras exista la organización; una clave revocada queda como revocada |
| Recuento diario de usos por clave y herramienta | Ver el consumo y decidir el plan | **13 meses**; después se borra solo |

No se guarda la clave completa (se muestra una sola vez, al crearla), ni datos personales de
contacto, ni ninguna URL, consulta, resultado o dirección IP de las peticiones: el recuento es un
número por día. Las claves nunca aparecen en los registros, las trazas ni el servicio de errores.

Solo el equipo de URLkit puede ver estos datos, con una herramienta de administración que se
ejecuta en el propio servidor; no hay ninguna página ni endpoint público que los muestre. A la base
de datos solo se puede conectar desde el propio servidor.

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
> o _por elegir_ todavía no es un compromiso. Lo que dicen los proveedores se consultó el
> 2026-11-12 (ver [Fuentes](#fuentes-de-los-proveedores)).

| Pieza | Quién | Qué recibe de tu visita | Qué registra |
|---|---|---|---|
| Web: páginas, código y catálogo de reglas | Cloudflare Pages | Tu IP, tu navegador y la página que abres (`/es/clean`). Nunca la URL que escribes: no sale del navegador, y en un enlace compartido va en el fragmento | Cloudflare trata tu IP y los datos de la conexión para servir la página y proteger su red. Para los registros que pone a nuestra disposición actúa como encargado del tratamiento, con su acuerdo de tratamiento de datos (DPA). No publica cuánto tiempo los guarda. Si el dominio de la web está en Cloudflare, su panel muestra al menos 31 días de analítica de tráfico en el plan gratuito; no la exportamos ni la usamos. No activamos Web Analytics, Bot Fight Mode ni Zaraz |
| Servidor de la API | Proveedor de VPS _por elegir_ (candidato: Hetzner Cloud, en Falkenstein, Núremberg o Helsinki) | Tráfico cifrado: IPs, puertos y volumen. No ve rutas, consultas ni la URL que inspeccionas, porque el cifrado termina en nuestro Caddy | Si es Hetzner: actúa como encargado del tratamiento con un DPA, y en esas ubicaciones los datos se guardan y procesan en la UE. Ni su política de privacidad ni su documentación dicen qué registra del tráfico de red de un servidor cloud ni durante cuánto tiempo. _Por confirmar_ con Hetzner al contratar |
| Proxy TLS | Caddy, en nuestro servidor | La petición completa | Nada de la petición. No hay registro de accesos, y los errores llevan solo mensaje, estado y duración (comprobado el 2026-11-10) |
| Contadores de cuota | Valkey, en nuestro servidor | El seudónimo del día | El contador, que caduca con su ventana |
| DNS de la API | _Por elegir_. Si es Cloudflare, en modo «solo DNS» | Las consultas por el nombre de la API, que normalmente hace tu resolvedor y no tu dispositivo | Si es Cloudflare: no publica cuánto tiempo guarda las consultas a su DNS autoritativo. _Por confirmar_ |
| Resolutores de la herramienta DNS | Cloudflare (`1.1.1.1`) y Quad9 (`9.9.9.9`), por DNS sobre HTTPS | El nombre que consultas, desde la IP de nuestro servidor. Nunca tu IP ni la URL completa | Cloudflare se compromete a borrar los registros de `1.1.1.1` en 25 horas y a no guardar la IP de origen salvo en un muestreo de paquetes para diagnóstico; esa IP es la de nuestro servidor. Quad9: lo que establezca su política de privacidad |
| Certificado TLS | La autoridad que usa Caddy (Let's Encrypt por defecto) | Nada de tus visitas: solo el nombre de la API al emitir el certificado | — |

El repositorio y el build de la web están en GitHub y Cloudflare; ninguno de los dos recibe datos
de quien visita la web.

No hay servicio externo de errores ni de trazas: en producción, `SENTRY_DSN` y
`OTEL_EXPORTER_OTLP_ENDPOINT` van vacíos, así que los errores y las trazas no salen del servidor.
Activar cualquiera de los dos exige añadir antes su fila a esta tabla.

### Fuentes de los proveedores

Consultadas el 2026-11-12:

- Cloudflare: [política de privacidad](https://www.cloudflare.com/privacypolicy/) y
  [acuerdo de tratamiento de datos](https://www.cloudflare.com/cloudflare-customer-dpa/). Tratan los
  datos de quien visita los sitios de sus clientes («End Users») y fijan su conservación por
  criterios, sin un plazo concreto.
- Cloudflare, analítica: [30 días de analítica en todos los planes](https://developers.cloudflare.com/changelog/post/2026-10-02-30-days-analytics-on-every-plan/)
  y [Security Analytics](https://developers.cloudflare.com/waf/analytics/security-analytics/).
- Cloudflare, `1.1.1.1`: [compromisos de privacidad del resolutor](https://developers.cloudflare.com/1.1.1.1/privacy/public-dns-resolver/).
- Hetzner: [protección de datos en Hetzner](https://docs.hetzner.com/general/company-and-policy/data-protection-at-hetzner/)
  (DPA, ubicación de los datos) y [política de privacidad](https://www.hetzner.com/legal/privacy-policy/).
  Ninguna de las dos trata el tráfico de red de los servidores cloud.

No se encontró documentación oficial sobre cuánto guarda Cloudflare las visitas a Pages ni las
consultas a su DNS autoritativo. Sustituir las dos marcas _por confirmar_ exige preguntárselo a
Cloudflare, o declarar en la tabla que no lo publica, como ya se hace.

### Antes de quitar la marca de borrador

- Elegir el proveedor del VPS y enlazar su política de privacidad. Si es Hetzner, preguntarle qué
  registra del tráfico de red de un servidor cloud y durante cuánto tiempo.
- Decidir el DNS de la API.
- Pedir a Cloudflare los plazos de Pages y del DNS autoritativo, o aceptar «no lo publica».
- Repasar las fuentes, porque las políticas cambian, y actualizar la fecha de la cabecera.

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
- **v3, primera parte** (claves de API para organizaciones): ya disponible. Qué se guarda está
  arriba, en "Claves de API para organizaciones".
- **v3, siguientes partes** (cuentas, historial, informes): guardar algo será **opcional y
  explícito**. Tener cuenta no cambiará el funcionamiento de las herramientas gratuitas, y seguirán
  usándose sin cuenta.

Cualquier cambio en este documento se hace junto al cambio de código que lo motiva, nunca después.
