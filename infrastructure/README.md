# Infraestructura

Configuración que atraviesa servicios. La web es estática y va a CDN; aquí solo está lo que
necesitan la API y su entorno. Ver [`docs/arquitectura.md`](../docs/arquitectura.md), sección 13.

| Directorio    | Qué contiene                                    | Cuándo se usa                                               |
| ------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `egress/`     | Cortafuegos de salida para la red del inspector | Perfiles `full` y `selfhosted`                              |
| `caddy/`      | Proxy inverso con HTTPS automático              | Solo si se autogestiona el despliegue (perfil `selfhosted`) |
| `monitoring/` | Prometheus y colector de OpenTelemetry          | Perfil `monitoring`                                         |

```bash
docker compose up -d                          # solo Valkey (desarrollo habitual)
docker compose --profile full up -d           # + API en contenedor y cortafuegos de salida
docker compose --profile selfhosted up -d     # producción en un VPS: lo anterior + Caddy
docker compose --profile monitoring up -d     # + Prometheus y colector OTel
```

## Red de salida restringida (segunda barrera)

Redirect Inspector sigue enlaces arbitrarios, así que la API puede intentar conectar con
cualquier dirección. La defensa principal está en el código: `apps/api/src/inspect/safe-fetch.ts`
resuelve el nombre, valida **todas** las IPs, conecta a la IP validada y repite la validación en
cada salto (Principio V). La red es la **segunda barrera**: protege de un fallo en ese código, nunca
lo sustituye.

En Compose:

- La red `internal` es `internal: true`: Valkey y los servicios internos no tienen salida.
- La red `egress` es la única con salida, con subred fija `172.30.0.0/24`.
- El servicio `egress-guard` inserta en la cadena `DOCKER-USER` del host reglas `DROP` desde esa
  subred hacia los rangos privados, loopback, link-local (incluido `169.254.169.254`), CGNAT,
  multicast y reservados ([`egress/apply-rules.sh`](egress/apply-rules.sh)).

  Deja pasar las respuestas de conexiones ya establecidas (`ESTABLISHED,RELATED`): sin esa
  excepción, un cliente o balanceador con IP privada que llama al puerto publicado no recibe
  respuesta. Las conexiones nuevas hacia esos rangos siguen descartándose.

`DOCKER-USER` existe en Linux con Docker Engine y también en la VM de Docker Desktop, donde
`network_mode: host` aplica las reglas (comprobado en macOS el 2026-11-09). Las reglas se pierden
al reiniciar la máquina o Docker Desktop, así que `egress-guard` se queda en marcha con
`restart: unless-stopped`: Docker lo arranca de nuevo y vuelve a aplicarlas. Durante los primeros
segundos tras un arranque la API puede estar en marcha antes que las reglas; en ese intervalo solo
protege la validación del código.

Limitación: las reglas filtran el tráfico **reenviado** (cadena `FORWARD`). Las conexiones a
servicios que escuchan en el propio host no pasan por `DOCKER-USER`; contra ellas la barrera es la
validación del código y el cortafuegos del host. Por eso la suite SSRF (`apps/api/tests/ssrf`) no
depende de la red.

Los puertos que Compose publica (Valkey, API, Prometheus, colector) escuchan solo en `127.0.0.1`.
Con el perfil `selfhosted`, lo único expuesto al exterior es Caddy (80/443).

### Equivalente en el despliegue gestionado

Con un proveedor de contenedores gestionado se configura la misma política con sus herramientas:

- **Kubernetes**: una `NetworkPolicy` de salida para los pods de la API que permita `0.0.0.0/0`
  con `except` para los rangos anteriores, y solo el puerto de Valkey hacia su servicio.
- **AWS (ECS/Fargate)**: subred privada con NAT, grupo de seguridad de salida limitado a 80, 443,
  8080 y 8443, y NACL que deniega los rangos privados y `169.254.169.254` (con IMDSv2 obligatorio
  como defensa adicional).
- **Fly.io, Render y similares**: si el proveedor no permite filtrar la salida por rango, se
  documenta en el plan de despliegue y la validación del código queda como única barrera; no se
  despliega sin decidirlo explícitamente.

## IP del cliente para las cuotas

La API cuenta las cuotas anónimas por IP seudonimizada. Detrás de Caddy, Compose define
`TRUST_PROXY=1` y la API toma la **última** entrada de `X-Forwarded-For`, la que añade Caddy; las
anteriores las escribe el cliente y permitirían saltarse los límites. Sin `TRUST_PROXY`, todas las
personas compartirían la IP de Caddy y una sola cuota.

Esto supone **un único proxy** delante de la API. Si se añade otro delante de Caddy (el proxy de
Cloudflare, un balanceador), hay que declararlo en `trusted_proxies` de Caddy; si no, Caddy
reenvía la IP de ese proxy y todas sus visitas comparten cuota.

## Observabilidad

- Caddy no escribe log de acceso, y en sus propios logs (errores como un 502) se borra la petición
  entera: IP del cliente, URI y cabeceras. Solo quedan el mensaje, el estado y la duración.
- Los logs de los contenedores tienen un límite de tamaño: `json-file` con 3 ficheros de 10 MB por
  servicio (`x-logging` en `docker-compose.yml`). No hace falta configurarlo en el demonio de
  Docker del servidor.
- `monitoring/prometheus.yml` lee `/internal/metrics` de la API. Ese camino no se expone al
  exterior: Caddy responde 404.
- `monitoring/otel-collector.yaml` recibe trazas OTLP y borra, como segunda barrera, cualquier
  atributo de URL o IP que llegara por error. La API ya limita los atributos a dominio
  registrable, estado y duración.

## Despliegue autogestionado (VPS)

Así se despliega el MVP (research R12): la web en Cloudflare Pages y la API en un VPS con el perfil
`selfhosted`. Los pasos que necesitan cuentas o el VPS son las tareas T111–T114.

### 1. Servidor

- Un VPS Linux (por ejemplo Hetzner Cloud en la UE) con Ubuntu LTS y **Docker Engine** del
  repositorio oficial de Docker, no Docker Desktop ni el paquete snap.
- Cortafuegos de entrada del proveedor: solo 80/tcp, 443/tcp y 443/udp (HTTP/3), y 22/tcp
  restringido a tu IP. Nada más: Valkey, la API y la monitorización ya escuchan solo en loopback.
- Actualizaciones de seguridad automáticas del sistema (`unattended-upgrades`).

### 2. DNS

- Un registro `A` de `API_DOMAIN` a la IP del VPS. Sin `AAAA`: la red de salida no tiene IPv6.
- Si el DNS está en Cloudflare, ese registro va **solo DNS** (nube gris). Con el proxy activado,
  Caddy vería las IPs de Cloudflare y todas las visitas compartirían cuota (ver "IP del cliente
  para las cuotas").

### 3. Primer despliegue

```bash
git clone -b production <repositorio> urlkit && cd urlkit
cp .env.example .env        # rellenar QUOTA_SECRET (openssl rand -hex 32), API_DOMAIN, WEB_ORIGIN
docker compose --profile selfhosted up -d --build
```

Caddy pide el certificado de `API_DOMAIN` al arrancar; el registro DNS tiene que existir antes.

**Sin dominio todavía.** Con `API_DOMAIN=localhost` la pila arranca igual: Caddy usa su CA local y
no pide nada fuera. Así se comprueba el servidor, Docker y egress-guard antes de decidir el dominio
o el DNS. Mientras tanto basta con abrir el 22/tcp en el cortafuegos: la comprobación se ejecuta en
el propio servidor, contra `https://localhost`.

Comprobación, la misma en local, en el servidor y en CI (trabajo `egress-linux`, sobre Docker
Engine en Linux):

```bash
infrastructure/check-selfhosted.sh
```

Lee `API_DOMAIN` de `.env` y comprueba:

- los cuatro servicios y el 443/udp;
- las 16 reglas de salida, y que **bloquean**: la API intenta conectar con `10.255.255.1` y el
  contador de la regla `DROP` de `10.0.0.0/8` tiene que subir. Una regla que existe pero no se
  recorre, por otro motor de `iptables` u otra cadena, no bloquea nada. Fallar la conexión no basta,
  porque también falla sin reglas;
- la salida a una dirección pública;
- `/v1/clean`, HTTP → HTTPS, `/internal/metrics` y el escenario 6 a través de Caddy;
- que los logs no contienen una IP de cliente marcada ni las URLs de prueba.

Solo lee: no cambia reglas, contenedores ni ficheros. Gasta una inspección de la cuota de Redirect
Inspector y termina con código 1 si algo falla. Justo después de un arranque, egress-guard tarda
unos segundos en aplicar las reglas: si falla la parte de reglas, repítelo.

### 4. Actualizar

El servidor sigue la rama `production`, la misma que publica la web (ver "Publicar una versión").

```bash
git pull && docker compose --profile selfhosted up -d --build && infrastructure/check-selfhosted.sh
```

No hay datos que migrar ni copias que hacer: Valkey solo guarda contadores con caducidad, y los
certificados de Caddy viven en el volumen `caddy_data`. Lo único que hay que conservar es `.env`.

### Poner o cambiar el dominio, o el proveedor de DNS

El dominio de la API solo existe en `.env` (`API_DOMAIN`, y `WEB_ORIGIN` para CORS); ni el código ni
la imagen dependen de él ni del proveedor de DNS. Para poner el primero o cambiarlo:

1. Crear el registro `A` del nuevo nombre a la IP del VPS en el DNS que toque (ver "2. DNS") y
   esperar a que resuelva.
2. Abrir 80/tcp, 443/tcp y 443/udp en el cortafuegos del proveedor. El 80 lo necesita Caddy para
   obtener el certificado.
3. Editar `API_DOMAIN` (y `WEB_ORIGIN` si cambia la web) en `.env` y aplicar:

   ```bash
   docker compose --profile selfhosted up -d && infrastructure/check-selfhosted.sh
   ```

   Compose recrea Caddy y la API con el valor nuevo, y Caddy pide el certificado del nombre nuevo.

4. Si cambia el nombre de la API, la web hay que reconstruirla con el `PUBLIC_API_URL` nuevo, que
   también fija la CSP (ver "5. Web en Cloudflare Pages").

Cambiar de proveedor de DNS es lo mismo sin tocar `.env`: crear el registro `A` en el nuevo y mover
los servidores de nombres del dominio. Lo único propio de Cloudflare es que el registro vaya en
modo **solo DNS**, y su fila en `docs/privacidad.md`, que hay que actualizar si cambia.

### 5. Web en Cloudflare Pages

Proyecto conectado al repositorio de GitHub:

| Ajuste                      | Valor                             |
| --------------------------- | --------------------------------- |
| Directorio raíz             | raíz del repositorio              |
| Comando de build            | `pnpm --filter @urlkit/web build` |
| Directorio de salida        | `apps/web/dist`                   |
| Variable `PUBLIC_API_URL`   | `https://<API_DOMAIN>`            |
| Variable `NODE_VERSION`     | `24`                              |
| Rama de producción          | `production`                      |
| Despliegues de vista previa | desactivados                      |

- La rama de producción es `production`, no `main`: Pages publica en cuanto recibe un push, sin
  esperar a CI. Ver "Publicar una versión".
- Sin vistas previas: cada rama tendría una copia pública en `*.pages.dev` que llama a la API de
  producción. CORS solo admite `WEB_ORIGIN`, así que su Redirect Inspector fallaría igualmente.
- `PUBLIC_API_URL` se fija en el build: decide a qué API llama Redirect Inspector y qué origen
  admite la CSP (`connect-src`). Cambiarla exige volver a desplegar la web.
- `apps/web/public/_headers` llega a `dist/_headers`, y Pages lo aplica tal cual.
- HSTS de la web: `max-age=63072000; includeSubDomains`, sin `preload`. Desde la primera visita,
  el navegador exige HTTPS durante dos años en **todos** los subdominios del dominio de la web: el
  dominio tiene que ser solo para URLkit, o tener HTTPS en todos sus subdominios. `preload` se
  quitó a propósito: con él, cualquiera puede enviar el dominio a la lista que los navegadores
  traen de serie, y salir de ella tarda meses. Entrar en esa lista es una decisión aparte, más
  adelante.
- El dominio propio de la web es el que va en `WEB_ORIGIN` del `.env` del VPS (CORS).
- **No activar** Web Analytics, Bot Fight Mode ni Zaraz: añaden scripts de terceros o cookies, y
  el MVP no tiene ninguno de los dos (Principio V).

El build de Pages se reprodujo en local en `node:24-bookworm-slim` con pnpm 10.34.9 y desde una
copia limpia del repositorio (`specs/001-mvp-url-toolkit/validation/quickstart-run.md`). Da el mismo
resultado que con Node 26. El aviso de Shiki sobre la CSP no afecta: la web no tiene Markdown ni
bloques de código.

Sin verificar hasta T112: que la imagen de build de Pages use la versión de pnpm de
`packageManager` en `package.json`. Si usa otra, se fija con la variable `PNPM_VERSION=10.34.9`.

### 6. Publicar una versión

Ningún cambio se integra con alguna puerta de calidad en rojo, y CI tarda varios minutos en
`main`. Pages conectado a `main` publicaría antes de que CI termine. Por eso producción es la rama
`production`, que solo avanza a un commit que ya pasó CI en `main`:

1. Push a `main` y esperar a que los dos trabajos de CI (`quality` y `egress-linux`) estén en verde.
2. Llevar ese mismo commit a producción, sin crear otro:

   ```bash
   git push origin main:production
   ```

   Pages compila y publica la web.

3. En el servidor, a continuación, "Actualizar" (sección 4).

La web y la API salen así del mismo commit. Durante los minutos entre los pasos 2 y 3, la web
nueva puede llamar a la API anterior: los cambios de `/v1` son aditivos, así que solo fallaría una
herramienta nueva que aún no tenga endpoint.

Para que GitHub lo haga cumplir y no dependa de la disciplina, una regla sobre `production` en
_Settings → Rules_ (o _Branches_):

- exigir que pasen los checks `quality` y `egress-linux`. El push del paso 2 lleva un commit que ya
  los pasó en `main`, así que se acepta; uno que no los pasó, no;
- bloquear los force push y el borrado de la rama.

En un repositorio privado con el plan gratuito de GitHub estas reglas no están disponibles. Sin
ellas, el paso 1 es responsabilidad de quien publica.

Sin verificar hasta T112: que la regla acepte el push del paso 2 con los checks que pasaron en
`main`.
