# Privacidad: qué se guarda, qué no y por qué

**Estado**: vigente | **Fecha**: 2026-11-06

Este documento describe los compromisos de privacidad del producto y cómo se materializan. No es
un texto legal: es la descripción técnica que cualquier persona puede verificar y que el equipo
está obligado a cumplir (Principio V de la [constitución](../.specify/memory/constitution.md)).

## El compromiso, en una frase

Las URLs que escribes no se almacenan en ningún sitio, y en cuatro de las cinco herramientas no
llegan siquiera a salir de tu navegador.

## Dónde se procesa cada herramienta

| Herramienta | Tu URL sale del navegador | Por qué |
|---|---|---|
| Smart Cleaner | **No** | La limpieza es cálculo local; el catálogo de reglas se descarga una vez |
| URL Parser | **No** | Análisis local con el analizador del propio navegador |
| URL Diff | **No** | Comparación local |
| Explain URL | **No** | Reglas fijas, sin IA, ejecutadas localmente |
| Redirect Inspector | **Sí** | Alguien tiene que seguir los saltos; si lo hiciera tu navegador, visitarías cada destino |

Que las cuatro primeras sean locales no es una optimización: es el motivo por el que el producto
puede ser gratuito, instantáneo y privado a la vez.

### Qué gana Redirect Inspector siendo remoto

Al seguir la cadena desde nuestro servidor, el sitio de destino **no ve tu dirección IP, tu
navegador ni tus cookies**: ve nuestra petición. Es una ventaja de privacidad, no una concesión.
A cambio, esa URL sí llega a nuestro servidor, y sobre eso aplica todo lo que sigue.

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

Redirect Inspector tiene un límite gratuito (10 inspecciones por hora y 50 al día) que hay que
poder contar sin identificar a nadie. Se resuelve así:

1. De tu dirección IP se calcula un **hash con clave** (HMAC-SHA256). En IPv6 se reduce primero al
   prefijo `/64`.
2. **La clave rota cada día.** El seudónimo de hoy no se puede relacionar con el de ayer.
3. El contador vive **solo durante su ventana** (la hora o el día en curso) y caduca solo.
4. La dirección IP original no se almacena en ningún momento.

Consecuencia honesta: si compartes red con mucha gente —una oficina, una universidad, una VPN—
compartís el contador. El mensaje de límite lo explica, y las otras cuatro herramientas siguen
funcionando sin límite porque no pasan por el servidor.

## Qué se mide

Solo contadores agregados, sin etiquetas que permitan distinguir visitantes:

- Usos por herramienta y resultado (`éxito` o `error`).
- Errores por herramienta y código.
- Duración de las inspecciones.

La web envía un único evento mínimo `{herramienta, resultado}` con `sendBeacon`. No lleva la URL,
ni identificador, ni cookie, ni referente útil. No hay analítica de terceros de ningún tipo.

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
  proveedor de contenedores; ambos pueden mantener sus propios registros operativos, sobre los
  que aplican sus políticas y no las nuestras. Se elegirán proveedores cuyos registros no incluyan
  rutas ni consultas, y el proveedor concreto se publicará cuando se despliegue.
- **El sitio que inspeccionas sabe que alguien lo inspeccionó.** Verá una petición de nuestro
  servicio, con un `User-Agent` identificable. No sabrá quién la pidió.

## Cómo verificarlo

- Abre las herramientas de red de tu navegador y usa el limpiador, el analizador, el comparador o
  la explicación: **no verás ninguna petición** con tu URL.
- Revisa el almacenamiento: no hay cookies.
- El código es el que está en este repositorio, y las garantías anteriores tienen pruebas
  automáticas que bloquean la integración si fallan.

## Qué cambiará en las próximas versiones

- **v2** (DNS, TLS, cabeceras, metadatos): son herramientas que consultan la red, así que el
  dominio que analices llegará al servidor, con las mismas reglas de no almacenamiento y los
  mismos límites seudonimizados.
- **v3** (cuentas, historial, informes): guardar algo será **opcional y explícito**. Tener cuenta
  no cambiará el funcionamiento de las herramientas gratuitas, y seguirán usándose sin cuenta.

Cualquier cambio en este documento se hace junto al cambio de código que lo motiva, nunca después.
