# Validación: escenarios del quickstart (002/T098)

**Fecha**: 2026-11-12 · **Catálogo**: 1.3.0

Escenarios de [quickstart.md](../quickstart.md) contra la red real. La API se arrancó en local
(`PORT=8788 node apps/api/src/server.ts`, contadores en memoria) porque el puerto 8787 lo ocupaba
el contenedor de la API del MVP. Los escenarios se lanzaron como peticiones a la API; lo que solo
se ve en la interfaz está cubierto por las pruebas e2e indicadas.

| # | Escenario | Resultado | Observado |
| --- | --- | --- | --- |
| 1 | HTTP Headers de `https://example.com/` | ✅ | Estado 200, 10 cabeceras, las 6 comprobaciones de seguridad, `catalogVersion` 1.3.0, `RateLimit-Remaining: 9` |
| 2 | HTTP Headers con redirección | ✅ | `http://github.com/` → `https://github.com/`, `hops: 1`. Se usó una redirección de http a https en lugar de un acortador de dos saltos |
| 3 | Cookies sin valor | ✅ | `https://www.bing.com/`: 12 `Set-Cookie`, todas con valor `<omitido>`, las 12 evaluadas por atributos |
| 4 | Destinos internos bloqueados | ✅ | `http://127.0.0.1:8080/` y `http://10.0.0.1.nip.io/` → `inspect.blocked.private-address`, sin conexión |
| 5 | Límite de 10 por hora | ✅ | El uso 11 recibe 429; Redirect Inspector sigue respondiendo 200 |
| 6 | Metadata con Open Graph | ✅ | `https://github.com/`: título efectivo desde Open Graph e imagen como dirección de texto. Que el navegador no la descarga lo comprueban `metadata.spec.ts` y `privacy.spec.ts` |
| 7 | Metadata de un PDF | ✅ | `metadata.not-html` con `application/pdf` |
| 8 | TLS con certificados inválidos | ✅ | `expired`, `self-signed`, `wrong.host` e `incomplete-chain.badssl.com` → `tls.expired`, `tls.self-signed`, `tls.name-mismatch`, `tls.incomplete-chain`, con la cadena recibida |
| 9 | TLS válido | ✅ | `sha256.badssl.com`: `trusted`, TLSv1.2, días restantes, transparencia `embedded` (2 SCT) |
| 10 | DNS de una URL | ✅ | `https://www.example.com/x` → consulta `www.example.com`, ofrece `example.com`; registros A con TTL |
| 11 | DNSSEC roto y sin firmar | ✅ | `dnssec-failed.org` → `bogus` (Cloudflare); `google.com` → `unsigned` |
| 12 | NXDOMAIN y uso especial | ✅ | Un `.com` inexistente → `nxdomain`; `localhost` → 400 `dns.special-use` |
| 13 | Security Analysis con paso de https a http | ✅ (tras corrección) | `https://postman-echo.com/redirect-to?url=http://neverssl.com/` → primer hallazgo `security.hop.https-downgrade` (alta), `scope.notChecked` con reputación y contenido, sin campos de nota ni veredicto |
| 14 | Security Analysis con DoH parado | ✅ (automático) | Cubierto por `apps/api/tests/integration/security.test.ts` |
| 15 | Navegación Headers → TLS → DNS → Security | ✅ (automático) | Cubierto por `apps/web/tests/e2e/navigation.spec.ts` |

## Comprobaciones de privacidad

- Los 27 registros del servidor durante la sesión no contienen ninguna URL, ruta, cookie ni IP:
  solo eventos `tool.run` y `quota.exceeded` con herramienta y resultado.
- Una petición por análisis y ninguna a terceros: `apps/web/tests/e2e/privacy.spec.ts`.
- Valkey no intervino en esta sesión (contadores en memoria). Su comportamiento con claves
  `quota:*` y caducidad lo verifica `apps/api/tests/integration/valkey.test.ts` contra Valkey real.

## Hallazgos de esta validación

1. **Corregido, Security Analysis.** En el escenario 13 el destino (`http://neverssl.com/`) no
   respondió a tiempo. La cadena quedaba incompleta y se descartaban también los avisos de los
   saltos ya observados, incluido el paso de https a http. Ahora una parte incompleta conserva
   lo observado (FR-062): cambio en `packages/core/src/tools/security/review.ts` e `index.ts`, con
   prueba en `security-review.test.ts`.
2. **Para revisar.** Cuando la cadena se corta por tiempo, TLS y DNS se revisan en el último host
   alcanzado (aquí `postman-echo.com`), no en el destino que no respondió. Es coherente con lo que
   se pudo observar, pero la interfaz no lo dice expresamente.
3. **Primer intento del escenario 13 fallido por el sitio de prueba:** `httpbin.org` responde 403
   al `User-Agent` de URLkit, así que no había redirección que analizar.
4. Dos fallos del MVP en Redirect Inspector, encontrados en T096 y ya corregidos, descritos en
   [reference-sets.md](./reference-sets.md).
