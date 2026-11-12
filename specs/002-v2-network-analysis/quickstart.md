# Quickstart: validar la versión 2

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Guía para comprobar de extremo a extremo que la v2 cumple la spec. Usa la puesta en marcha del
[quickstart de la 001](../001-mvp-url-toolkit/quickstart.md); los scripts exactos se crean
durante la implementación.

## Requisitos previos

- Los mismos que el MVP: Node ≥ 24, pnpm 10 y Docker para Valkey.
- `openssl` en el PATH, solo para regenerar los certificados de prueba
  (`apps/api/tests/fixtures/tls/`).
- Salida a Internet por 443 para los escenarios manuales. Las pruebas automáticas no la necesitan:
  usan un servidor HTTPS local y un DoH falso.

## Puertas de calidad automáticas

```bash
pnpm lint && pnpm typecheck && pnpm boundaries
pnpm test                           # núcleo (observaciones sintéticas), catálogo 1.3.0, API, contrato, SSRF por conector
pnpm test:e2e                       # cinco páginas nuevas con axe
pnpm size && pnpm lhci
```

Resultado esperado: todo en verde. Además:

- la suite SSRF ejecuta `tests/ssrf-vectors/vectors.json` contra `safeFetch` y contra el conector
  TLS;
- `pnpm size` confirma que `parse5` no aparece en ninguna página web.

## Escenarios manuales

| # | Historia | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | HTTP Headers (P1) | `/es/headers`, analizar `https://example.com/` | Estado 200, cabeceras en orden, tabla de seguridad con cada cabecera del catálogo, `catalogVersion` 1.3.0 |
| 2 | HTTP Headers (P1) | Analizar un enlace acortado que redirige 2 veces | `hops: 2`, URL final indicada, acción "Ver cadena en Redirect Inspector" |
| 3 | HTTP Headers (P1) | Analizar una página que pone dos cookies | Dos `Set-Cookie` separadas con valor `<omitido>`; atributos evaluados por cookie |
| 4 | HTTP Headers (P1) | Analizar `http://127.0.0.1:8080/` y un dominio que resuelve a `10.0.0.1` | `stopReason: blocked` con `inspect.blocked.private-address`, sin conexión |
| 5 | HTTP Headers (P1) | Hacer 11 análisis en una hora | El 11.º muestra el límite; Redirect Inspector y las demás herramientas siguen disponibles |
| 6 | Metadata (P2) | Analizar una página con Open Graph completo | Valores agrupados por origen; `effective` con `from: openGraph`; la imagen aparece como texto, sin petición del navegador hacia ella (comprobar en el panel de red) |
| 7 | Metadata (P2) | Analizar un PDF o una imagen | `metadata.not-html` con el tipo de contenido |
| 8 | TLS (P3) | Analizar `expired.badssl.com`, `self-signed.badssl.com`, `wrong.host.badssl.com` e `incomplete-chain.badssl.com` | `tls.expired`, `tls.self-signed`, `tls.name-mismatch` y `tls.incomplete-chain`, con la cadena recibida a la vista |
| 9 | TLS (P3) | Analizar un host con certificado válido | `trust: trusted`, versión del protocolo, días restantes, `transparency.status: embedded` |
| 10 | DNS (P4) | Consultar `https://www.example.com/x` | Se consulta `www.example.com` y se ofrece `example.com`; registros por tipo con TTL |
| 11 | DNS (P4) | Consultar `dnssec-failed.org` y un dominio sin firmar | `bogus` y `unsigned`, respectivamente, con el resolutor que respondió |
| 12 | DNS (P4) | Consultar `no-existe-${aleatorio}.example.org` y `localhost` | `outcome: nxdomain`; `localhost` se rechaza con `dns.special-use` |
| 13 | Security (P5) | Analizar un enlace de prueba que redirige de `https` a `http` hacia un sitio sin HSTS | Hallazgos ordenados por gravedad, cada uno enlazado a su herramienta; `scope.notChecked` muestra reputación y contenido; ni nota ni veredicto |
| 14 | Security (P5) | Analizar con el DoH falso parado (entorno local) | Resultado parcial: `parts.dns.state: incomplete`, el resto completo |
| 15 | Navegación | Headers → "Enviar a TLS" → "Enviar a DNS" | La misma entrada en cada paso; nada se lanza solo al abrir el enlace compartido |

## Comprobaciones de privacidad

- En el panel de red del navegador, cada análisis hace una sola petición: un `POST` a la API con la
  URL en el cuerpo. Ninguna petición va a hosts de terceros, tampoco las de `og:image` o iconos.
- Los logs y las trazas de la API, tras los escenarios 1–14, no contienen URLs, rutas, cabeceras,
  valores de cookies, certificados ni registros. Las trazas llevan como máximo el dominio
  registrable.
- En Valkey solo hay claves `quota:*` con TTL, ahora también de `headers`, `metadata`, `tls`,
  `dns` y `security`.

## Comprobación de API

```bash
curl -s -X POST 'http://localhost:8787/v1/headers?lang=es' \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/"}'
```

Esperado: `status: 200`, una lista `security` y las cabeceras `RateLimit-*` de la cuota
`headers`.

## Conjuntos de referencia (fuera de CI)

SC-003 a SC-006 se validan contra la red real con un script manual: 50 sitios, 50 páginas, los
hosts de `badssl.com` y dominios firmados y sin firmar. El resultado se registra en
`validation/`, como en la 001.
