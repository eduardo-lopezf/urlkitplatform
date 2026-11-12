# Ejecución de quickstart.md

**Fecha**: 2026-11-06 · **Entorno**: macOS, Node 26.5, pnpm 10.34, Google Chrome (Playwright
1.65), sin Docker en marcha.

**Segunda pasada**: 2026-11-08, con Valkey 8.1.11 (`docker compose`) y la API en local con
`REDIS_URL=redis://localhost:6379`. Cubre los escenarios 5–7 y la comprobación de Valkey.

## Puertas de calidad automáticas

| Comando | Resultado |
|---|---|
| `pnpm lint` | ✅ ESLint y Prettier sin errores |
| `pnpm typecheck` | ✅ sin errores en los 7 paquetes y apps (ver nota sobre `astro check`) |
| `pnpm boundaries` | ✅ sin violaciones; la suite de fixtures demuestra que cada regla falla |
| `pnpm test` | ✅ 1412 pruebas: WPT, casos límite, corpus SC-002 (243 casos), contratos, SSRF (85 vectores), privacidad, cuotas |
| `PW_CHANNEL=chrome pnpm test:e2e` | ✅ 68 pruebas (escritorio y 320 px), axe AA sin violaciones, tres ejecuciones seguidas |
| `pnpm size` | ✅ 111,5 KB comprimidos sumando el JS de todas las páginas (límite 150 KB por página) |
| `pnpm lhci` | ✅ accesibilidad 100 y LCP ≈ 0,67 s en 4G simulado en las seis páginas de herramienta |

## Escenarios manuales

| # | Escenario | Resultado | Cómo se comprobó |
|---|---|---|---|
| 1 | Smart Cleaner con `utm_source` y `fbclid` | ✅ | e2e `clean.spec.ts` y `curl` a la API real |
| 2 | Desenvolver redirección de Google | ✅ | e2e `clean.spec.ts` |
| 3 | Limpieza máxima con vista previa y preferencia recordada | ✅ | e2e `clean.spec.ts` |
| 4 | URL Parser con IDN, repetidos y fragmento | ✅ | e2e `parse.spec.ts` |
| 5 | Inspeccionar un enlace acortado de 2 saltos | ✅ | Acortador público real (2026-11-08): `http://youtu.be/…` → 301 → `https://youtu.be/…` → 303 → `youtube.com/watch` 200, `stopReason: final`. También `httpbin.org/redirect/2` (2 saltos). Antes: API simulada (e2e) y servidor local real (integración) |
| 6 | Bloquear `169.254.169.254` y un dominio que resuelve a `127.0.0.1` | ✅ | API real: `stopReason: blocked` sin conexión; vectores SSRF. Repetido el 2026-11-08 con `localtest.me`: `inspect.blocked.private-address` |
| 7 | La 11.ª inspección en una hora muestra el límite | ✅ | Pruebas de contrato y e2e con el mensaje de tiempo restante. Con Valkey real (2026-11-08): la 11.ª devuelve 429 `quota.exceeded` con `Retry-After` y `retryAfterSeconds`; `clean` y `parse` siguen respondiendo 200 |
| 8 | URL Diff que solo difiere en `utm_campaign` | ✅ | e2e `diff.spec.ts` |
| 9 | Explain URL con `paypal.com@ejemplo-malo.xyz` | ✅ | e2e `explain.spec.ts` |
| 10 | Limpiar → Enviar a Explain → enlace en otra ventana | ✅ | e2e `navigation.spec.ts` |

## Comprobaciones de privacidad

| Comprobación | Resultado |
|---|---|
| Las herramientas locales no envían la URL | ✅ e2e `privacy.spec.ts`: solo sale `POST /v1/metrics/events` con `{tool, outcome}` |
| Sin cookies | ✅ e2e en todas las páginas |
| Logs de la API sin URLs, consultas ni IPs | ✅ prueba de integración y log real del servidor revisado. 2026-11-08, tras los escenarios 5–7: 18 líneas, solo `tool.run`, `quota.exceeded` y `api.listening`; ninguna URL, dominio inspeccionado ni IP |
| En Valkey solo claves `quota:*` con TTL | ✅ 2026-11-08, `RedisStore` contra Valkey real: 3 claves (`quota:local:hour`, `quota:inspect:hour`, `quota:inspect:day`), todas con TTL, sujeto `anon-ip` seudonimizado (hash), ninguna IP ni URL. Automatizado en `apps/api/tests/integration/valkey.test.ts` (se ejecuta con `REDIS_URL`; sin él se salta) |

## Pendientes de pasadas anteriores (resueltos el 2026-11-09)

- **Valkey en CI**: `ci.yml` levanta un servicio `valkey/valkey:8-alpine` y define `REDIS_URL` en
  `pnpm test`, así que `valkey.test.ts` ya no se salta. Comprobado en local con la misma
  configuración: 1455 pruebas en verde.
- **Cortafuegos de salida**: probado en Docker Desktop (macOS), donde sí se aplica (ver la sección
  siguiente). Encontró un fallo que se corrigió.
- **Puertos publicados**: Valkey, API, Prometheus y colector se publican solo en `127.0.0.1`. Con
  el perfil `selfhosted` solo Caddy (80/443) da al exterior; `/internal/metrics` y Valkey (sin
  contraseña) dejan de ser accesibles desde fuera aunque el host no tenga cortafuegos.

## API en contenedor (perfil `full`, 2026-11-08)

Imagen `urlkitplatform-api` construida con `docker compose --profile full build api` (541 MB,
`node:24-alpine`) y arrancada con `docker compose --profile full up -d api`, sin `egress-guard`.

| Comprobación | Resultado |
|---|---|
| Sin `QUOTA_SECRET` | ✅ el contenedor sale con código 1 y `config.invalid`, sin arrancar |
| Con secreto de 64 caracteres | ✅ `api.listening` en 8787; usuario `node`; redes `internal` y `egress` |
| `POST /v1/clean` | ✅ 200, `output` correcto, `RateLimit-Limit: 600` |
| Escenario 5 (`youtu.be`) | ✅ 301 → 303 → 200, `stopReason: final` |
| Escenario 6 | ✅ `blocked` para `169.254.169.254`, `localtest.me`, `[::1]` y los nombres internos `redis` y `api` (`private-address`); `redis:6379` se bloquea por puerto |
| Escenario 7 | ✅ la 11.ª inspección devuelve 429 `quota.exceeded` |
| Valkey a través de la red `internal` | ✅ solo claves `quota:*`, todas con TTL, sujeto seudonimizado |
| Logs del contenedor | ✅ solo `tool.run`, `quota.exceeded` y `api.listening`; ninguna URL ni IP |

`docker compose up -d` ya no necesita `QUOTA_SECRET`: la interpolación `${QUOTA_SECRET:?…}`
rompía Compose aunque solo se quisiera Valkey, y se cambió a `${QUOTA_SECRET:-}`. La API sigue sin
arrancar en producción sin un secreto de 32 caracteres o más (comprobado arriba).

## Cortafuegos de salida (`egress-guard`, 2026-11-09)

Docker Desktop 29.7.2 en macOS. La VM de Docker Desktop tiene la cadena `DOCKER-USER` con el mismo
motor (`iptables` sobre nf_tables) que usa el script, y `network_mode: host` la alcanza, así que
la nota anterior de que «en Docker Desktop no tiene efecto» era incorrecta.

Prueba: contenedor en la red `egress` (`172.30.0.0/24`) y el propio contenedor de la API, antes y
después de `docker compose --profile full run --rm egress-guard`. El destino privado es un servidor
temporal en `127.0.0.1` del Mac, alcanzable como `host.docker.internal` (`192.168.65.254`).

| Destino | Sin reglas | Con reglas |
|---|---|---|
| `host.docker.internal:18999` (privado) | abierto | ✅ bloqueado, también desde la API |
| `169.254.169.254:80` | — | ✅ bloqueado |
| `10.0.0.1:80` | — | ✅ bloqueado |
| `1.1.1.1:443` (público) | abierto | ✅ abierto |

**Fallo encontrado y corregido**: con las reglas aplicadas, la API dejaba de responder en su puerto
publicado (timeout). Las respuestas de la API a un cliente con IP privada (en Docker Desktop llega
desde `192.168.65.x`; en un servidor, un balanceador o la LAN) coincidían con los `DROP`. Se añadió
en `apply-rules.sh` una regla `ESTABLISHED,RELATED → ACCEPT` en cabeza: las respuestas pasan y las
conexiones nuevas hacia rangos privados siguen bloqueadas (tabla de arriba repetida tras el
cambio, mismo resultado).

Con las reglas corregidas: `POST /v1/clean` 200; escenario 5 (`youtu.be`) 301 → 303 → 200,
`stopReason: final`; escenario 6 `blocked` para `169.254.169.254` y `localtest.me`; Valkey solo con
claves `quota:*` con TTL y sujeto seudonimizado.

Sin cubrir: un host Linux con Docker Engine (mismo mecanismo, no ejecutado allí), y los servicios
que escuchan en el propio host, que no pasan por `DOCKER-USER` (documentado en
`infrastructure/README.md`).

## IP del cliente detrás de Caddy (2026-11-10)

Antes, Compose no definía `TRUST_PROXY`: detrás de Caddy todas las visitas habrían compartido una
cuota. Además, la API tomaba la primera entrada de `X-Forwarded-For`, que escribe el cliente. Ahora
`TRUST_PROXY=1` y se toma la última (`apps/api/src/quota/client-ip.ts`, prueba en
`apps/api/tests/integration/client-ip.test.ts`, en rojo con la lógica anterior).

Con el `Caddyfile` real (en HTTP, `API_DOMAIN=:8080`) delante de la imagen reconstruida:

| Comprobación | Resultado |
|---|---|
| 3 peticiones desde el Mac con `X-Forwarded-For` falsificado distinto | ✅ un único sujeto `anon-ip`, contador 3 |
| 1 petición desde otro contenedor | ✅ sujeto distinto, contador 1 |
| `/internal/metrics` a través de Caddy | ✅ 404 |

## Perfil `selfhosted` en local (T110, 2026-11-10)

`docker compose --profile selfhosted up -d --build` en Docker Desktop (macOS), con
`API_DOMAIN=localhost` (certificado de la CA local de Caddy).

| Comprobación | Resultado |
|---|---|
| `--profile selfhosted` solo arranca Valkey, API, egress-guard y Caddy | ✅ antes fallaba: Caddy dependía de `api`, que solo estaba en `full` |
| Comprobación de API del quickstart a través de Caddy (HTTPS) | ✅ `output` = `https://ejemplo.com/?id=1` |
| HTTP → HTTPS | ✅ 308 |
| `/internal/metrics` a través de Caddy | ✅ 404 |
| Escenarios 5 y 6 a través de Caddy | ✅ `final` (301 → 303 → 200) y `blocked` |
| Reglas de salida tras perderlas y reiniciar los contenedores (como en un arranque) | ✅ 0 → 16 reglas; `10.0.0.1` bloqueado |
| Certificado de Caddy tras recrear el contenedor | ✅ mismo número de serie (volumen `caddy_data`) |
| Logs de Caddy con un 502 provocado y `X-Forwarded-For`, consulta y cabeceras de prueba | ✅ solo mensaje, estado y duración; ninguna IP, URI ni cabecera |

**Fallo encontrado y corregido**: los logs de error de Caddy incluían la petición completa (IP del
cliente, URI y cabeceras). `log { output discard }` solo descartaba el log de acceso. El
`Caddyfile` filtra ahora la petición en el logger por defecto.

No probado: un reinicio real de la máquina o de Docker Desktop. Se simuló borrando las reglas y
reiniciando los contenedores; que Docker arranque al inicio los servicios con
`restart: unless-stopped` es su comportamiento estándar.

## HTTP/3 y límite de logs (2026-11-12)

Dos ajustes de `docker-compose.yml` que salieron al preparar T111, probados con el perfil
`selfhosted` en Docker Desktop 29.7.2 (macOS) y `API_DOMAIN=localhost`.

| Comprobación | Resultado |
|---|---|
| Caddy publica `443/udp` | ✅ antes solo `443/tcp`: Caddy anunciaba `alt-svc: h3=":443"` pero el puerto UDP no llegaba al contenedor |
| `POST /v1/clean` solo por HTTP/3 (cliente QUIC `aioquic` 1.7.2, fuera del repositorio) | ✅ 200, `output` = `https://ejemplo.com/?id=1` |
| Límite de logs en los servicios del perfil | ✅ `redis`, `api`, `egress-guard` y `caddy` con `json-file`, `max-size: 10m`, `max-file: 3` |
| Reglas de salida tras recrear los contenedores | ✅ 16 reglas sobre `172.30.0.0/24` |
| Logs de Caddy tras la petición HTTP/3 | ✅ sin IP del cliente, URI ni cabeceras |

El curl de macOS y el de las imágenes `alpine` y `curlimages/curl` no traen HTTP/3; por eso la
prueba usa un cliente QUIC en Python.

## Script de comprobación del perfil `selfhosted` (2026-11-12)

`infrastructure/check-selfhosted.sh` reúne las comprobaciones de T110 para ejecutarlas igual en
local y en el VPS (T111). Probado en Docker Desktop 29.7.2 (macOS) con `API_DOMAIN=localhost`.

| Caso | Resultado |
|---|---|
| Pila en marcha | ✅ 13 comprobaciones correctas, código 0; el contador de `DROP` de `10.0.0.0/8` sube (3 → 6) |
| Regla `DROP` de `10.0.0.0/8` borrada a mano | ✅ falla con «15 de 16» y el contador sin regla, código 1. La conexión a `10.255.255.1` también falla sin la regla: por eso la prueba mira el contador |
| Tras `restart egress-guard` | ✅ vuelven las 16 reglas y pasa de nuevo. Si se lanza durante los segundos que tarda en aplicarlas, falla la parte de reglas |
| `API_DOMAIN` que no resuelve | ✅ las comprobaciones a través de Caddy fallan sin abortar el script |
| Órdenes del paso de CI (`egress-linux`): perfil `full`, después `selfhosted --wait` y el script, con `QUOTA_SECRET` de prueba | ✅ código 0 en Docker Desktop. En Docker Engine sobre Linux, pendiente del primer push |

## Build de Cloudflare Pages con Node 24 (2026-11-12)

Parte local de T112: el comando de build de Pages (`pnpm --filter @urlkit/web build`) con
`PUBLIC_API_URL=https://api.example.com`, desde una copia de los ficheros versionados (como un clon
nuevo), en `node:24-bookworm-slim` (glibc, como la imagen de build de Pages).

| Comprobación | Resultado |
|---|---|
| Node 24.22.3, pnpm 10.34.9 de `packageManager` con corepack | ✅ `install --frozen-lockfile` en 92 s, con el `postinstall` que compila el catálogo; build en 37 s |
| `dist/_headers` | ✅ idéntico a `apps/web/public/_headers` |
| CSP de las 27 páginas | ✅ todas con `connect-src 'self' https://api.example.com`; ninguna referencia a `localhost:8787` |
| Comparación con el mismo build en Node 26.5 | ✅ 52 ficheros en los dos; JS y CSS idénticos; los HTML solo difieren en el `uid` aleatorio de las islas |
| Presupuesto de JS (`size-limit`) | ✅ 143,55 KB de 150 |

Aviso del build, igual en Node 24 y 26: Shiki indica que su resaltado usa estilos en línea
incompatibles con la CSP. No afecta: la web no tiene Markdown ni bloques de código.

Al preparar la copia, el `tar` de macOS añadió ficheros `._*` (atributos extendidos) y la
compilación del catálogo falló al leerlos como JSON. Un clon de Git no los tiene; la copia se
rehízo con `COPYFILE_DISABLE=1 tar --no-xattrs`.

Pendiente para T112: que la imagen de Pages use esa versión de pnpm.
