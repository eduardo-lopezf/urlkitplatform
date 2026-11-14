# Research: Versión 3, primera parte — claves de API y cuotas por plan

Cada decisión técnica con su razón y sus alternativas. La spec es [spec.md](./spec.md); el plan,
[plan.md](./plan.md).

## R1. PostgreSQL, propiedad de la API Node, con `pg` y Kysely

- **Decisión**: las organizaciones, las claves y los recuentos de consumo se guardan en
  **PostgreSQL**, como fija `docs/arquitectura.md` para la versión 3. El dueño del esquema es la
  API (`apps/api`), que es quien valida las claves en cada petición; nadie más accede a sus tablas
  (Principio IX). El acceso se hace con el controlador **`pg`** y el constructor de consultas
  tipado **Kysely**, cuyo migrador ejecuta migraciones en TypeScript con `up` y `down`.
- **Razón**: la tabla de la versión 3 de `docs/arquitectura.md` nombra SQLAlchemy 2 y Alembic,
  que son de Python. La v2 concluyó que no hacía falta Python (§11), y la única pieza que necesita
  las claves es la API Node. Seguir la tabla al pie de la letra obligaría a crear un servicio
  Python solo para guardar tres tablas y a que la API le preguntara en cada petición: un lenguaje,
  un despliegue y una llamada más, sin ningún beneficio (Principio VII). Se mantiene lo que la
  arquitectura decide de verdad: PostgreSQL, migraciones versionadas con plan de reversión, un
  único dueño del esquema y pruebas de integración contra la base real. La persona decidió esta
  dirección el 2026-11-13. `docs/arquitectura.md` (tabla de la versión 3 y fila
  "Servicio ↔ PostgreSQL" de §12) se enmienda en la primera tarea, antes que el código.
- **Por qué Kysely**: consultas tipadas sin generar código, sin motor binario ni capa de objetos,
  y un migrador incluido con `up`/`down`. El esquema tiene tres tablas; un ORM completo sería
  más superficie que problema.
- **Tipos**: la interfaz `Database` de Kysely se escribe junto a las migraciones, en el mismo
  servicio que posee el esquema. Una prueba de integración migra una base vacía y comprueba que
  las columnas coinciden con esa interfaz, para que la migración y los tipos no diverjan.
- **Alternativas**: servicio Python con SQLAlchemy y Alembic (descartado arriba); Prisma (motor
  binario y generación de cliente para tres tablas); Drizzle (válido, pero su migrador genera SQL
  desde el esquema TypeScript y no tiene `down`, y la arquitectura pide plan de reversión); `pg`
  con SQL a mano y `node-pg-migrate` (sin tipos en las consultas); SQLite (un fichero local rompe
  el Principio IV: la API debe poder tener varias instancias sin estado); guardar las claves en
  Valkey (no es un almacén duradero en el despliegue actual y la arquitectura lo reserva para
  contadores).

## R2. Formato de la clave y cómo se guarda

- **Decisión**: la clave tiene la forma `uk_<id>_<secreto>`.
  - `<id>` es el identificador corto y público (FR-004): 12 caracteres en base32 en minúsculas, sin
    caracteres ambiguos.
  - `<secreto>` son 32 bytes aleatorios de `crypto.randomBytes`, en base64url (43 caracteres).
  - El prefijo `uk_` permite a los escáneres de secretos reconocerla si se filtra.
  - Se guarda el `id` y el **SHA-256 del secreto**; la clave completa solo existe en la salida de la
    herramienta de administración al crearla (FR-003).
  - La verificación compara los resúmenes con `crypto.timingSafeEqual`.
- **Razón**: el secreto tiene 256 bits de entropía, así que un resumen rápido basta: los
  algoritmos lentos (bcrypt, Argon2) protegen contraseñas elegidas por personas, no secretos
  aleatorios, y añadirían decenas de milisegundos por petición en contra de SC-004. El `id` en la
  propia clave permite buscar la fila sin recorrer la tabla y sin depender del secreto.
- **Alternativas**: un UUID como clave (sin prefijo reconocible y sin `id` separado del secreto);
  bcrypt o Argon2 (lentos sin necesidad); JWT firmados (no se pueden revocar sin una lista de
  revocación, que es justo la tabla que ya tenemos).

## R3. Verificación en cada petición y revocación en menos de un minuto

- **Decisión**: la API verifica la clave contra PostgreSQL y guarda el resultado en una caché en
  memoria del proceso con una vida de **30 segundos**, tanto para las claves válidas como para las
  no válidas. La entrada guarda el `organizationId`, el plan y el estado; nunca el secreto. La
  caché tiene un tamaño máximo (10.000 entradas, se descartan las más antiguas).
- **Razón**:
  - FR-013 y SC-003 piden que la revocación surta efecto en menos de un minuto en todas las
    instancias. Con 30 segundos de vida, cualquier instancia ve el cambio a los 30 s como mucho,
    sin coordinación entre instancias, y los servicios siguen sin estado compartido (Principio IV).
  - SC-004 pide no más de 50 ms de diferencia con el uso anónimo: con la caché, casi todas las
    peticiones no tocan la base de datos.
  - La caché de negativos protege la base de datos de quien prueba claves al azar.
- **Alternativas**: consultar la base de datos en cada petición (añade latencia y carga sin
  necesidad); avisar a las instancias de una revocación por Valkey (coordinación que 30 s hacen
  innecesaria); vida más larga (incumpliría SC-003).

## R4. Planes como datos versionados en la API

- **Decisión**: los planes se declaran en `apps/api/src/quota/plans.json`, validado con un
  esquema en las pruebas, con el plan `anonymous` actual y un plan inicial **`organization`**. La
  base de datos solo guarda el identificador del plan de cada organización. `planFor(subject)` lee
  de ese fichero.
- **Límites iniciales del plan `organization`**: diez veces los anónimos en las herramientas de
  red (100 por hora y 1.000 al día en `inspect`, `headers`, `metadata`, `tls`, `dns` y
  `security`) y 6.000 por hora en `local`. `metrics` no aplica: solo lo usa la web.
- **Razón**: FR-021 pide planes declarativos y versionados (Principio X). Los planes no son reglas
  de URLs, así que no van en `packages/rules`: la arquitectura dice que los planes viven en el
  adaptador y nunca en el núcleo (`apps/api/src/quota/plans.ts` ya lo anuncia). Un fichero junto al
  código se revisa en cada cambio y no necesita una herramienta para crear planes.
- **Plan que desaparece**: si una organización apunta a un plan que ya no está en el fichero, la
  API aplica los límites del plan anónimo y lo registra como aviso (FR-025). La herramienta de
  administración rechaza asignar un plan que no existe.
- **Alternativas**: tabla de planes en la base de datos (planes editables sin revisión, en contra
  de FR-021); planes en `packages/rules` (mezcla datos de plataforma con reglas de URLs).

## R5. Sujeto de la cuota: la organización

- **Decisión**: una petición con clave válida se identifica con el sujeto
  `{ type: 'organization', organizationId }` para la cuota, que ya existe en `Subject` desde el MVP.
  Todas las claves de la organización suman contra las mismas claves de Valkey (FR-023). El `keyId`
  solo se usa para medir el consumo (R6).
- **Razón**: la aclaración del 2026-11-13 dejó solo límites por organización. El limitador, las
  cabeceras `RateLimit-*` y el error de cuota no cambian (FR-024): cambia de qué sujeto se trata.
- **Alternativas**: sujeto `api-key` con límites por clave (descartado en la aclaración; queda
  disponible si un cliente los pide).

## R6. Medición del consumo

- **Decisión**: cada petición atendida con clave suma uno a una fila
  `usage_daily(day, organization_id, key_id, bucket)` con `INSERT … ON CONFLICT DO UPDATE SET
  count = count + 1`. La escritura se lanza **después** de enviar la respuesta y su fallo solo se
  registra (sin datos de la petición); nunca hace fallar la petición. Las peticiones rechazadas por
  cuota no cuentan como consumo.
- **Conservación (FR-033)**: la API borra las filas de más de 13 meses al arrancar y luego una vez
  al día con un temporizador del proceso. El borrado es idempotente, así que varias instancias no
  necesitan coordinarse. La herramienta de administración tiene además `usage prune`.
- **Razón**: el volumen está acotado por los límites de los planes (como mucho unos miles de filas
  al día). Una cola o un proceso aparte serían infraestructura nueva para una escritura de una fila
  (Principio VII). Escribir después de responder deja la latencia intacta (SC-004).
- **Alternativas**: contar en Valkey y volcar a PostgreSQL periódicamente (dos almacenes y un
  proceso de volcado; se reconsidera si el volumen lo pide); escribir antes de responder (añade
  latencia); medir en la cuota de Valkey (los contadores caducan con la ventana y no dan el
  histórico de 13 meses).

## R7. Herramienta de administración

- **Decisión**: una CLI en `apps/api/src/admin/cli.ts`, en el mismo paquete que posee el esquema
  y con el mismo módulo de base de datos. Se ejecuta en el servidor con
  `docker compose exec api node apps/api/src/admin/cli.ts <orden>` (o con `pnpm --filter @urlkit/api admin`
  en desarrollo). No hay ningún endpoint HTTP de administración (FR-001). Órdenes, argumentos y
  salidas en [contracts/admin-cli.md](./contracts/admin-cli.md).
- **Razón**: la spec pide una herramienta que no esté en la API pública ni en la web. Ejecutarla
  dentro del contenedor reutiliza la conexión a la base de datos sin abrir puertos nuevos. Con
  `node:util.parseArgs` no hace falta ninguna dependencia.
- **Alternativas**: endpoint de administración protegido (superficie pública nueva y un secreto de
  administrador más que custodiar); conectarse a PostgreSQL desde fuera con un cliente SQL (sin
  validación, y obliga a publicar el puerto).

## R8. Errores de autenticación y de almacenamiento

- **Decisión**:
  - Una cabecera `Authorization` presente pero no válida (vacía, otro esquema, formato erróneo,
    clave inexistente o revocada, organización desactivada) responde **401** con `auth.invalid` y
    `WWW-Authenticate: Bearer`, el mismo cuerpo en todos los casos (FR-012).
  - Antes de responder 401 se consume un uso de la cuota anónima de quien envía la petición en el
    grupo de esa herramienta (FR-027). Si esa cuota está agotada, responde 429 con
    `quota.exceeded`, como hoy.
  - Si PostgreSQL no responde al verificar una clave que no está en caché, responde **503** con un
    código nuevo del contrato, **`auth.unavailable`**, y `Retry-After: 30` (FR-043). Las peticiones
    sin cabecera no tocan la base de datos y siguen funcionando.
  - `auth.missing` sigue reservado: ningún endpoint de esta parte exige clave.
- **Razón**: añadir un código al contrato es compatible (Principio IV); `internal.error` (500)
  diría que el fallo es nuestro e inesperado, cuando es una dependencia temporalmente caída y el
  cliente puede reintentar.
- **Alternativas**: atender como anónima una petición con clave mala o con la base de datos caída
  (incumple FR-012 y FR-043); usar `internal.error`.

## R9. CORS y navegador

- **Decisión**: CORS no cambia: sigue permitiendo solo el origen de la web y solo la cabecera
  `content-type`. Un navegador de otro origen no puede enviar `Authorization` a la API.
- **Razón**: las claves son para integraciones de servidor a servidor. Poner una clave en el
  navegador la expone a cualquiera que abra las herramientas de desarrollo. La web no usa claves
  (FR-014), así que no necesita permitir la cabecera.
- **Alternativas**: permitir `Authorization` en CORS (invita a filtrar claves en páginas web).

## R10. Sin base de datos configurada

- **Decisión**: si `DATABASE_URL` no está definida, las claves están desactivadas: las peticiones
  sin cabecera funcionan como hoy y las que traen `Authorization` reciben `auth.invalid`, porque no
  existe ninguna clave. En producción (`NODE_ENV=production`) la API no arranca sin `DATABASE_URL`,
  igual que hoy sin `REDIS_URL`.
- **Razón**: `pnpm dev` y las pruebas existentes siguen funcionando sin PostgreSQL (SC-002), y
  producción no puede quedarse sin claves por un olvido de configuración.

## R11. Pruebas

- **Decisión**:
  - Un `KeyStore` en memoria con la misma interfaz que el de PostgreSQL, para las pruebas de las
    rutas y del limitador, como `MemoryStore` en las cuotas.
  - Pruebas de integración contra PostgreSQL real: migraciones arriba y abajo, verificación de
    claves, revocación, consumo y borrado a los 13 meses. Se ejecutan con
    `DATABASE_URL=… pnpm test` y se saltan sin ella; en CI hay un servicio PostgreSQL, como el de
    Valkey.
  - Pruebas de contrato: 401, 503 y cabeceras de cuota con clave, y que **ninguna** respuesta
    anónima cambia (SC-002).
  - Pruebas de privacidad: ni el secreto ni la clave completa en logs, trazas ni errores; nada de
    URLs ni IPs en las tablas (SC-005).
  - Prueba de copia y restauración (SC-007): `pg_dump` de una base con claves, restauración en una
    vacía y verificación de que las claves activas siguen funcionando.

## R12. Infraestructura y copias de seguridad

- **Decisión**:
  - `docker-compose.yml` añade un servicio `postgres` (imagen oficial `postgres:17-alpine`) con
    volumen propio, en los perfiles `full` y `selfhosted` y también para desarrollo. Como Valkey,
    está en las redes `internal` (donde lo alcanza la API) y `default`, y su puerto solo se publica
    en `127.0.0.1`: nadie de fuera del servidor puede conectarse.
  - La API ejecuta las migraciones pendientes al arrancar.
  - Copias: `pg_dump` en formato personalizado y `pg_restore`, documentados en
    `infrastructure/README.md` con la prueba de SC-007.
  - `infrastructure/check-selfhosted.sh` comprueba también que `postgres` está en marcha y que su
    puerto solo escucha en `127.0.0.1`.
- **Razón**: misma imagen en local, en CI y en el VPS. La red `default` es la que permite publicar
  el puerto en `127.0.0.1` para `pnpm dev`; una red interna no puede publicar puertos. PostgreSQL no
  inicia conexiones, así que lo que importa es que nadie de fuera pueda llegar a él (corregido al
  implementar, 2026-11-13: la primera versión decía "solo en la red interna, sin salida").
- **Alternativas**: PostgreSQL gestionado desde el principio (dependencia y proveedor nuevos antes
  de necesitarlos; se reconsidera con el despliegue gestionado de research R12 de la 001).
