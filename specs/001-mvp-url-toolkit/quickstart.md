# Quickstart: validar el MVP de URLkit

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Guía para comprobar de extremo a extremo que el MVP cumple la spec. Los comandos asumen la
estructura de [plan.md](./plan.md); los scripts exactos se crean durante la implementación.

## Requisitos previos

- Node.js LTS y pnpm
- Docker (para Redis/Valkey local y el servidor DNS de pruebas SSRF)

## Puesta en marcha

```bash
pnpm install
docker compose up -d redis          # contadores de cuota
pnpm dev                            # web en http://localhost:4321, API en http://localhost:8787
```

## Puertas de calidad automáticas

```bash
pnpm lint && pnpm typecheck
pnpm test                           # núcleo, reglas (corpus SC-002), API, contrato, SSRF
pnpm test:e2e                       # Playwright + axe (AA, 320 px, teclado)
pnpm size                           # JS inicial < 150 KB por página
pnpm lhci                           # carga inicial < 1 s en 4G simulado
```

Resultado esperado: todo en verde. Las pruebas de contrato validan respuestas contra
[contracts/openapi.yaml](./contracts/openapi.yaml).

## Escenarios manuales

| # | Historia | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | Smart Cleaner (P1) | Abrir `/es/clean`, pegar `https://shop.example/p?id=7&utm_source=x&fbclid=y` | Salida `https://shop.example/p?id=7`; lista con `utm_source` y `fbclid` y su motivo; "Copiar" funciona |
| 2 | Smart Cleaner (P1) | Pegar `https://www.google.com/url?q=https%3A%2F%2Fejemplo.com%2F%3Futm_medium%3Dz` | Salida `https://ejemplo.com/` desenvuelta y limpia |
| 3 | Smart Cleaner (P1) | Pegar un enlace de producto de tienda conocida, activar "limpieza máxima" | Vista previa con forma canónica; la preferencia se conserva al recargar |
| 4 | URL Parser (P2) | Pegar `https://usuario@münchen.de:8080/a%20b/c?x=1&x=2&y=#sec` | Host Unicode y `xn--mnchen-3ya.de`, puerto 8080, dos `x`, `y` vacío, fragmento `sec` |
| 5 | Redirect Inspector (P3) | Inspeccionar un enlace acortado de prueba con 2 saltos | 3 pasos con estado y duración; "Limpiar destino" abre Smart Cleaner |
| 6 | Redirect Inspector (P3) | Inspeccionar `http://169.254.169.254/` y un dominio que resuelve a `127.0.0.1` | `stopReason: blocked` con motivo, sin conexión saliente |
| 7 | Redirect Inspector (P3) | Hacer 11 inspecciones en una hora | La 11.ª muestra el límite y el tiempo restante; las demás herramientas siguen funcionando |
| 8 | URL Diff (P4) | Comparar dos URLs que solo difieren en `utm_campaign` y en el orden de parámetros | Solo se informa `utm_campaign` |
| 9 | Explain URL (P5) | Explicar `https://paypal.com@ejemplo-malo.xyz/login` | Aviso `userinfo-deception`; dominio real `ejemplo-malo.xyz` |
| 10 | Navegación (P6) | Limpiar → "Enviar a Explain URL" → copiar enlace y abrirlo en otra ventana | Misma URL cargada en cada paso; el enlace reproduce la entrada |

## Comprobaciones de privacidad

- Con las herramientas locales, el panel de red del navegador no muestra peticiones con la URL
  (solo el evento anónimo `POST /v1/metrics/events` con `{tool, outcome}`).
- El navegador no tiene cookies del sitio.
- Los logs de la API tras los escenarios 5–7 no contienen URLs, consultas ni IPs.
- En Redis solo hay claves `quota:*` con TTL y hashes, sin IPs.

## Comprobación de API

```bash
curl -s -X POST http://localhost:8787/v1/clean \
  -H 'content-type: application/json' \
  -d '{"url":"https://ejemplo.com/?utm_source=x&id=1"}'
```

Esperado: `output` = `https://ejemplo.com/?id=1` y cabeceras `RateLimit-*`.
