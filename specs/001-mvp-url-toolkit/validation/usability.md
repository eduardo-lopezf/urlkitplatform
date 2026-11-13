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

## Ensayo previo sin participantes (2026-11-12)

Comprueba que el material de la prueba funciona, no la usabilidad. Las cinco URLs se abrieron con
sus enlaces compartibles en `pnpm dev`, en español y en inglés, a 360 px y en escritorio.

Enlaces para la sesión (anteponer el origen, por ejemplo `http://localhost:4321`; en inglés,
cambiar `/es/` por `/en/`):

| # | Enlace |
|---|---|
| 1 | `/es/explain#u=https%3A%2F%2Fpaypal.com%40ejemplo-malo.xyz%2Flogin` |
| 2 | `/es/explain#u=https%3A%2F%2Fwww.banco.example.secure-login.xyz%2Facceso` |
| 3 | `/es/explain#u=https%3A%2F%2F%D0%B0%D1%80%D1%80%D3%8F%D0%B5.com%2F` |
| 4 | `/es/explain#u=https%3A%2F%2Flogin.microsoftonline.example.com.evil.top%2F` |
| 5 | `/es/explain#u=https%3A%2F%2Fwww.google.com%2Furl%3Fq%3Dhttps%253A%252F%252Fejemplo-malo.xyz` |

Lo que muestra la tarjeta «Sitio real» y los avisos:

| # | «Sitio real» (resaltado) | Avisos | ¿Coincide con lo esperado? |
|---|---|---|---|
| 1 | `ejemplo-malo.xyz` | Atención: lo anterior a `@` no es el destino. Información: `.xyz` | Sí |
| 2 | `www.banco.example.` atenuado, `secure-login.xyz` resaltado | Información: `.xyz` | Sí |
| 3 | `xn--80ak6aa92e.com` resaltado; debajo, atenuado, «Se ve como: аррӏе.com» | Atención: letras de otro alfabeto, forma real `xn--80ak6aa92e.com` | Sí, tras el cambio de la tarjeta (ver observaciones) |
| 4 | `login.microsoftonline.example.com.` atenuado, `evil.top` resaltado | Información: `.top` | Sí |
| 5 | `www.` atenuado, `google.com` resaltado | Información: contiene otra URL, `https://ejemplo-malo.xyz` | Sí |

Resultado igual en los dos idiomas. A 360 px no hay desplazamiento horizontal y, en la 4, el
dominio resaltado baja a su propia línea.

Observaciones antes de la sesión:

- **URL 3**: en la primera pasada, lo que más destacaba en la tarjeta era la forma cirílica, que a
  la vista se lee «apple.com», con la forma real `xn--80ak6aa92e.com` debajo y atenuada. Si los
  participantes respondían «apple.com», el resultado mediría la jerarquía visual de la tarjeta, no
  la explicación. Se cambió `apps/web/src/islands/ExplainIsland.vue`: con un aviso `homograph` o
  `mixed-scripts`, la tarjeta resalta la forma ASCII y deja la Unicode como «Se ve como». Los
  dominios internacionales legítimos (`münchen.de`) siguen en Unicode. Lo cubren dos pruebas de
  `apps/web/tests/e2e/explain.spec.ts`. Repetido el ensayo en es y en a 360 px: correcto.
- **URLs 2 y 4**: la única pista, además del resaltado, es el aviso de terminación. No hay ningún
  aviso específico para una marca puesta en el subdominio.
- **URL 5**: tiene dos respuestas defendibles: `google.com`, adonde lleva el enlace, y
  `ejemplo-malo.xyz`, adonde acabaría redirigiendo. No entra en el criterio de éxito, así que se
  registra como informativa y cuentan las dos.

## Resultados

| Participante | Idioma | 1 | 2 | 3 | 4 | 5 | Comentarios |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | Pendiente |
