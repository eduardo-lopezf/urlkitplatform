# Prueba de usabilidad de Explain URL (SC-007)

**Estado**: pendiente de ejecutar con personas. No se ha realizado todavía.

**Criterio**: el 90 % o más de participantes no técnicos identifican correctamente el dominio real
de una URL engañosa usando Explain URL.

## Protocolo propuesto

- **Participantes**: 10 personas sin perfil técnico (no trabajan en desarrollo, sistemas ni
  seguridad). Mitad en español y mitad en inglés.
- **Material**: `/es/explain` o `/en/explain` en un móvil de 360 px y en un portátil.
- **Tarea**: para cada una de las cinco URLs siguientes, abrir el enlace compartible y responder
  «¿a qué sitio te llevaría este enlace?». Sin ayuda del moderador.

| # | URL | Dominio real esperado |
|---|---|---|
| 1 | `https://paypal.com@ejemplo-malo.xyz/login` | `ejemplo-malo.xyz` |
| 2 | `https://www.banco.example.secure-login.xyz/acceso` | `secure-login.xyz` |
| 3 | `https://аррӏе.com/` (cirílico) | `xn--80ak6aa92e.com`, no apple.com |
| 4 | `https://login.microsoftonline.example.com.evil.top/` | `evil.top` |
| 5 | `https://www.google.com/url?q=https%3A%2F%2Fejemplo-malo.xyz` | `google.com` (con aviso de URL anidada) |

- **Registro**: acierto o fallo por URL, tiempo hasta responder y comentarios literales.
- **Éxito**: al menos 9 de 10 participantes aciertan las URLs 1 a 4.

## Resultados

| Participante | Idioma | 1 | 2 | 3 | 4 | 5 | Comentarios |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | Pendiente |
