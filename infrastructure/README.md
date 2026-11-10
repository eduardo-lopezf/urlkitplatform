# Infraestructura

Configuración que atraviesa servicios. La web es estática y va a CDN; aquí solo está lo que
necesitan la API y su entorno. Ver [`docs/arquitectura.md`](../docs/arquitectura.md), sección 13.

| Directorio    | Qué contiene                                    | Cuándo se usa                                               |
| ------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `egress/`     | Cortafuegos de salida para la red del inspector | Compose con el perfil `full` (Linux)                        |
| `caddy/`      | Proxy inverso con HTTPS automático              | Solo si se autogestiona el despliegue (perfil `selfhosted`) |
| `monitoring/` | Prometheus y colector de OpenTelemetry          | Perfil `monitoring`                                         |

```bash
docker compose up -d                          # solo Valkey (desarrollo habitual)
docker compose --profile full up -d           # + API en contenedor y cortafuegos de salida
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
`network_mode: host` aplica las reglas (comprobado en macOS el 2026-11-09). En Docker Desktop las
reglas se pierden al reiniciarlo; se vuelven a aplicar con
`docker compose --profile full run --rm egress-guard`.

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

## Observabilidad

- `monitoring/prometheus.yml` lee `/internal/metrics` de la API. Ese camino no se expone al
  exterior: Caddy responde 404.
- `monitoring/otel-collector.yaml` recibe trazas OTLP y borra, como segunda barrera, cualquier
  atributo de URL o IP que llegara por error. La API ya limita los atributos a dominio
  registrable, estado y duración.
