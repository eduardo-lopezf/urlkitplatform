# Día de pruebas con personas: guion, preparación y hoja de resultados

Reúne en un solo día las tres pruebas de usabilidad que quedan. No sustituye a sus protocolos:
los criterios, las URLs esperadas y los ensayos siguen en cada uno, y los resultados se pasan
después a sus tablas.

| Prueba | Protocolo | Participantes | Tiempo por persona | Éxito |
| --- | --- | --- | --- | --- |
| Explain URL (001/T103, SC-007) | [`001 validation/usability.md`](../../001-mvp-url-toolkit/validation/usability.md) | Grupo A | ~10 min | ≥ 9 de 10 aciertan las URLs 1 a 4 |
| Security Analysis (002/T098b, SC-007) | [`usability.md`](./usability.md) | Grupo A, la misma sesión | ~15 min | ≥ 9 de 10 aciertan las dos preguntas en cada enlace |
| Primera llamada con el SDK (004, SC-001) | [`004 validation/usability.md`](../../004-typescript-sdk/validation/usability.md) | Grupo B | ~10 min | cada una lo consigue en menos de 5 min |

- **Grupo A**: 10 personas sin perfil técnico (no trabajan en desarrollo, sistemas ni
  seguridad), 5 en español y 5 en inglés.
- **Grupo B**: de 1 a 3 personas que programan en TypeScript o JavaScript con Node y no conocen
  URLkit. No pueden ser del grupo A ni haber visto la sesión de otra persona.

**Ensayado el 2026-11-17** sin participantes: la API y la web de la sesión, servidas en la
dirección de la red local, responden desde otro equipo de la red; la web llama a la API (CORS y
CSP correctos) y el enlace 2 de Security Analysis devuelve `tls.expired` (alta) como primer
hallazgo. El registro de la API no contiene ninguna URL, dominio ni IP.

Antes de la sesión real se hizo una simulación con diez personas ficticias, como ensayo previo
(«Simulación con Claude» en los protocolos de la 001 y la 002). No cuenta para SC-007.

## Calendario

- **Grupo A**: bloques de 35 minutos (30 de sesión y 5 para anotar y reiniciar la API). Diez
  personas son unas 6 horas: mejor dos medias jornadas de cinco.
- **Dispositivo**: alterna. Participantes impares en el móvil, pares en el portátil, de modo que
  cada idioma tenga los dos dispositivos. Cada participante usa uno solo.
- **Grupo B**: bloques de 15 minutos, en cualquier hueco. Usa la API del perfil `selfhosted` en
  el 8787, no la de la sesión del grupo A.

## La víspera

Con el portátil y el móvil en la misma red Wi-Fi.

1. **Dirección del portátil en la red**. Anótala; en los pasos siguientes es `<IP>`. Si cambia
   el día de la sesión (otra red, otro router), hay que repetir el paso 2.

   ```bash
   ipconfig getifaddr en0
   ```

2. **Compila la web apuntando a la API de la sesión**. Sustituye `<IP>`:

   ```bash
   PUBLIC_API_URL=http://<IP>:8788 pnpm --filter @urlkit/web build
   ```

3. **Arranca las dos piezas** (ver «En la sesión») y abre `http://<IP>:4323/es/` en el móvil. La
   primera vez, macOS puede preguntar si `node` acepta conexiones entrantes: acepta. Si el móvil
   no carga la página, comprueba que la red no aísla los dispositivos entre sí (algunas redes de
   invitados lo hacen).

4. **Recorre los nueve enlaces** de «Enlaces», en español y en inglés, en el móvil y en el
   portátil. Comprueba que cada uno muestra lo que dicen los protocolos. Son más de 10 análisis
   de Security Analysis: reinicia la API cuando se agote el límite.

5. **Grupo B**: prepara el paquete y la clave como dice la «Preparación» del
   [protocolo del SDK](../../004-typescript-sdk/validation/usability.md), con el perfil
   `selfhosted` en marcha. Comprueba que `docker compose ps` muestra `api` y `postgres`.

6. **Imprime o abre esta hoja** y prepara un reloj para medir tiempos.

## En la sesión

Dos terminales, desde la raíz del repositorio.

**Terminal 1: la API de la sesión**, en el 8788, con los contadores de cuota en memoria:

```bash
cd apps/api && PORT=8788 WEB_ORIGIN=http://<IP>:4323 node src/server.ts
```

**Terminal 2: la web compilada**, en el 4323:

```bash
PORT=4323 node apps/web/scripts/serve-dist.mjs
```

**Entre participante y participante, reinicia la API** (Ctrl+C en el terminal 1 y la misma orden
otra vez). Security Analysis permite 10 análisis por hora y 50 al día por dispositivo. Cada
participante hace 4, o alguno más si repite. Sin el reinicio, el tercero en el mismo dispositivo
se encontraría el límite. Como los contadores viven en memoria, reiniciar los vacía. Esta API no
comparte nada con la del perfil `selfhosted`: no toca Valkey ni la base de datos.

Por qué una API propia y no `pnpm dev` ni el perfil `selfhosted`:

- con Valkey, la cuota no se vacía al reiniciar;
- el móvil necesita la dirección de la red, no `localhost`, tanto en la web como en el CORS de la
  API.

Explain URL no llama a la API: funciona aunque la API esté parada.

## Enlaces

Antepón `http://<IP>:4323`. En inglés, cambia `/es/` por `/en/`.

**Explain URL** (resultado esperado en el protocolo de la 001):

| # | Enlace |
| --- | --- |
| E1 | `/es/explain#u=https%3A%2F%2Fpaypal.com%40ejemplo-malo.xyz%2Flogin` |
| E2 | `/es/explain#u=https%3A%2F%2Fwww.banco.example.secure-login.xyz%2Facceso` |
| E3 | `/es/explain#u=https%3A%2F%2F%D0%B0%D1%80%D1%80%D3%8F%D0%B5.com%2F` |
| E4 | `/es/explain#u=https%3A%2F%2Flogin.microsoftonline.example.com.evil.top%2F` |
| E5 | `/es/explain#u=https%3A%2F%2Fwww.google.com%2Furl%3Fq%3Dhttps%253A%252F%252Fejemplo-malo.xyz` |

**Security Analysis** (resultado esperado en [`usability.md`](./usability.md)):

| # | Enlace |
| --- | --- |
| S1 | `/es/security#u=https%3A%2F%2Fpostman-echo.com%2Fredirect-to%3Furl%3Dhttp%3A%2F%2Fexample.com%2F` |
| S2 | `/es/security#u=https%3A%2F%2Fexpired.badssl.com%2F` |
| S3 | `/es/security#u=https%3A%2F%2Fself-signed.badssl.com%2F` |
| S4 | `/es/security#u=https%3A%2F%2Fwrong.host.badssl.com%2F` |

Cómo hacer llegar los enlaces al participante: ábrelos tú en el dispositivo antes de pasárselo.
Escribirlos no forma parte de la prueba. En el móvil, lo más cómodo es una nota compartida o un
mensaje a ti mismo con los nueve enlaces.

**Abre cada enlace en una pestaña nueva** (o recarga la página después de abrirlo). Si en la misma
pestaña solo cambia lo que va tras `#`, la página no se recarga y sigue mostrando el enlace
anterior: el participante respondería sobre otra URL. Lo encontró la simulación del 2026-11-17 y
está corregido (001/T102a: la página se recarga), pero abrir cada enlace en una pestaña nueva sigue
siendo lo más seguro.

## Guion del grupo A

Lo que va entre comillas se dice tal cual. Fuera de eso, el moderador no explica, no señala la
pantalla y no confirma si una respuesta es correcta.

**Antes de empezar (1 min)**

> «Gracias por venir. Vamos a probar una herramienta, no a ti: si algo no se entiende, es culpa de
> la herramienta. No hay respuestas incorrectas. Durante las tareas no puedo ayudarte, pero dime
> en voz alta lo que piensas mientras miras la pantalla. No guardo tu nombre ni grabo la sesión.»

> "Thanks for coming. We are testing a tool, not you: if something is unclear, it is the tool's
> fault. There are no wrong answers. I can't help you during the tasks, but please say out loud
> what you think as you look at the screen. I won't keep your name or record the session."

**Explain URL (10 min)**: para cada enlace, E1 a E5, ábrelo y pregunta:

> «¿A qué sitio te llevaría este enlace?» / "Which site would this link take you to?"

Anota la respuesta literal y el tiempo hasta responder. E5 es informativa: valen `google.com` y
`ejemplo-malo.xyz`.

**Pausa breve.**

**Security Analysis (15 min)**: para cada enlace, S1 a S4, ábrelo y di:

> «Pulsa “Analizar”.» / "Press 'Analyze'."

Cuando aparezca el resultado, las dos preguntas:

> 1. «¿Cuál es el problema más grave de este enlace?» / "What is the most serious problem with
>    this link?"
> 2. «¿Qué no ha comprobado la herramienta?» / "What did the tool not check?"

Anota el acierto de cada pregunta, el tiempo y si tuvo que desplazarse para responder.

- **Si TLS sale «Incompleto»** ("Incomplete") en S2, S3 o S4, es el fallo residual conocido (en torno a 1 de
  cada 10 análisis; ver el protocolo). Di «Vuelve a pulsar “Analizar”» y anótalo como repetición.
  No cuenta como ayuda.
- **Si aparece «Has alcanzado el límite gratuito de revisiones»** ("You have reached the free
  limit of reviews"), has olvidado reiniciar la API: reiníciala, repite el enlace y anótalo.

**Para terminar (5 min)**:

> «¿Qué te ha resultado confuso?» / "What did you find confusing?"

> «¿Confiarías en un enlace solo porque la herramienta no muestra problemas graves?» / "Would you
> trust a link just because the tool shows no serious problems?"

## Guion del grupo B

Lo dice el [protocolo del SDK](../../004-typescript-sdk/validation/usability.md). En resumen:

- solo se dicen dos cosas: que se instala con `npm install ./urlkit-sdk-0.1.0.tgz` y que la API
  está en `http://localhost:8787/v1`;
- la clave ya está en `URLKIT_API_KEY`;
- el tiempo empieza con el primer comando en el directorio vacío y termina cuando el programa
  imprime `https://ejemplo.com/?id=1` y un número de peticiones restantes.

Usa una clave por sesión y revócala al terminar (`key revoke <id>`).

## Hoja de resultados

Sin nombres: cada participante es un código (A01…A10, B1…B3). En los aciertos: ✓, ✗, o ✓r si
acertó tras una repetición por TLS.

### Grupo A

| Part. | Idioma | Disp. | E1 | E2 | E3 | E4 | E5 (resp.) | S1 P1/P2 | S2 P1/P2 | S3 P1/P2 | S4 P1/P2 | ¿Se desplazó? | Tiempos | Comentarios literales |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A01 | es | móvil | | | | | | | | | | | | |
| A02 | es | portátil | | | | | | | | | | | | |
| A03 | es | móvil | | | | | | | | | | | | |
| A04 | es | portátil | | | | | | | | | | | | |
| A05 | es | móvil | | | | | | | | | | | | |
| A06 | en | portátil | | | | | | | | | | | | |
| A07 | en | móvil | | | | | | | | | | | | |
| A08 | en | portátil | | | | | | | | | | | | |
| A09 | en | móvil | | | | | | | | | | | | |
| A10 | en | portátil | | | | | | | | | | | | |

Preguntas finales (una línea por participante): qué le resultó confuso, y si confiaría en un
enlace sin problemas graves.

### Grupo B

| Part. | Experiencia | Tiempo | ¿< 5 min? | Atascos (dónde y cuánto) | Leyó además del README | Comentarios |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | | | | | | |
| B2 | | | | | | |
| B3 | | | | | | |

## Después

1. Revoca las claves del grupo B y para los dos terminales.
2. Pasa los resultados a las tablas «Resultados» de los tres protocolos, o dame esta hoja
   rellena y lo hago yo, con el cálculo de cada criterio.
3. Si algún criterio no se cumple, se anota la causa y se corrige antes de dar la tarea por
   cerrada, como dice cada protocolo.
4. `apps/web/dist/` queda compilado contra la dirección de la sesión. No se publica nada desde
   ahí, y `pnpm build` y `pnpm test:e2e` vuelven a compilarlo.
