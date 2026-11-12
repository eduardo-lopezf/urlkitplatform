# Certificados de prueba (solo para pruebas)

Material de las pruebas de TLS y HTTP Headers de la v2 (`specs/002-v2-network-analysis`, T004).
**Solo sirven para pruebas**: las claves privadas están en el repositorio a propósito y no deben
usarse en ningún otro sitio.

Para regenerarlos hace falta OpenSSL ≥ 3.0:

```bash
bash apps/api/tests/fixtures/tls/generate.sh
```

| Fichero                        | Qué es                                                                |
| ------------------------------ | --------------------------------------------------------------------- |
| `root.pem`, `intermediate.pem` | CA de prueba: raíz e intermedio                                       |
| `valid.*`                      | Hoja válida para `localhost` y `127.0.0.1`, con su intermedio         |
| `expired.*`                    | Validez del 2020-01-01 al 2020-02-01                                  |
| `not-yet-valid.*`              | Validez a partir del 2099-01-01                                       |
| `other-name.*`                 | Emitido para `other.test`                                             |
| `no-intermediate.*`            | La hoja válida, servida sin el intermedio                             |
| `sha1.*`                       | Firmado con `ecdsa-with-SHA1`                                         |
| `sct.*`                        | Hoja con la extensión SCT (`1.3.6.1.4.1.11129.2.4.2`) y una SCT falsa |
| `self-signed.*`                | Autofirmado, fuera de la CA de prueba                                 |

Cada `*.chain.pem` es la cadena tal como la enviaría el servidor (hoja + intermedio). La de
`no-intermediate` y la de `self-signed` contienen solo la hoja.

Los certificados vigentes caducan a los 10 años de generarse; al regenerarlos, cambian las fechas
pero no los nombres.
