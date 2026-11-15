# Primera llamada con el SDK (004, SC-001)

**Estado**: protocolo preparado y ensayado sin participantes (2026-11-15). Pendiente de ejecutar
con personas.

**Criterio** (spec, SC-001): una persona que no conoce el SDK hace su primera llamada correcta en
menos de 5 minutos desde la instalación, siguiendo solo la documentación del paquete.

No forma parte de la sesión conjunta de la 001 y la 002 (`specs/002-v2-network-analysis/validation/usability.md`,
«Sesión conjunta»): aquella pide personas sin perfil técnico, y esta, personas que programan.

## Protocolo

- **Participantes**: de 1 a 3 personas que programan en TypeScript o JavaScript con Node y no
  conocen URLkit ni su SDK. La spec no fija cuántas; con el SDK sin publicar, el objetivo es ver
  dónde se atasca alguien, no una estadística.
- **Material**, preparado por quien modera (ver «Preparación»):
  - un directorio vacío con Node 24 o posterior y su editor habitual;
  - el paquete `urlkit-sdk-0.1.0.tgz`, generado con `pnpm --filter @urlkit/sdk pack`;
  - su `README.md`, abierto aparte (es el mismo que va dentro del paquete);
  - la API local en `http://localhost:8787/v1`;
  - una clave de prueba en la variable de entorno `URLKIT_API_KEY` del terminal.
- **Lo único que se dice de palabra**, porque el SDK aún no está publicado ni hay API en
  producción: «instálalo con `npm install ./urlkit-sdk-0.1.0.tgz` en lugar de
  `npm install @urlkit/sdk`» y «la API está en `http://localhost:8787/v1`». Nada más; las dudas
  se resuelven con el README.
- **Tarea principal**: «Con tu clave, limpia la URL
  `https://ejemplo.com/?utm_source=boletin&id=1` e imprime el resultado y cuántas peticiones te
  quedan».
- **Tarea adicional**, si sobra tiempo y sin contar para el criterio: «Prueba con una clave
  inventada e imprime el código de error que devuelve la API».
- **Medida**: tiempo desde el primer comando en el directorio vacío hasta que el programa imprime
  `https://ejemplo.com/?id=1` y un número de peticiones restantes.
- **Registro**: tiempo, dónde se atascó y cuánto tiempo, si leyó algo además del README (el código
  del paquete, sus tipos, una búsqueda) y comentarios literales.
- **Éxito**: cada participante lo consigue en menos de 5 minutos. Si alguien no lo consigue, se
  anota la causa y se corrige la documentación antes de publicar.

## Preparación

Desde la raíz del repositorio, con el perfil `selfhosted` en marcha (`docker compose ps` muestra
`api` y `postgres`):

```bash
pnpm --filter @urlkit/sdk pack --pack-destination <directorio-de-la-sesion>
```

```bash
docker compose exec -T api node apps/api/src/admin/cli.ts key create SdkUsability
```

La organización de prueba `SdkUsability` ya existe en la base de desarrollo (creada en el ensayo).
La clave se imprime una sola vez: se copia al terminal del participante como `URLKIT_API_KEY` y no
se guarda en el repositorio. Al terminar la sesión, se revoca con `key revoke <id>`.

## Ensayo previo sin participantes (2026-11-15)

Comprueba que el material funciona, no la usabilidad. Paquete generado con `pnpm pack`, instalado
en un directorio vacío fuera del repositorio con `npm install ./urlkit-sdk-0.1.0.tgz` (sin red: el
paquete no tiene dependencias), contra la API del perfil `selfhosted` en el 8787 y con una clave
de `SdkUsability`. El ejemplo de «Primera llamada» del README, con `baseUrl` añadido, imprime
`https://ejemplo.com/?id=1` y `5999`.

Observaciones antes de la sesión:

- **El proyecto nuevo es CommonJS.** `npm init -y` (npm 11) escribe `"type": "commonjs"`, y el
  ejemplo del README, con `import` y `await` en el nivel superior, falla en un `index.ts` o un
  `index.js` con «Cannot use import statement outside a module». Funciona con `"type": "module"`
  en `package.json` o con la extensión `.mts`; desde CommonJS, `require('@urlkit/sdk')` también
  funciona en Node 24, pero sin `await` en el nivel superior. El README no dice nada de esto, y es
  el atasco más probable de la tarea. **Corregido el mismo día:** el README dice ahora, en
  «Instalación», que el código debe ser un módulo ES y cómo conseguirlo. Repetido en un proyecto
  nuevo de `npm init -y` con `"type": "module"`: correcto. Si en la sesión alguien se atasca
  igualmente aquí, se registra.
- **`baseUrl` es obligatoria en la sesión.** Sin ella, el cliente llama a la dirección de
  producción, que aún no existe, y el error es `UrlkitTransportError` `network`. El README explica
  ahora cómo apuntar a otra instancia, con un ejemplo local; aun así, la dirección se dice de
  palabra al empezar, porque la persona no tiene otra forma de saberla.
- **Node ejecuta `.ts` directamente** (Node 24 elimina los tipos), así que no hace falta instalar
  TypeScript para la tarea. Los tipos llegan al editor desde `dist/index.d.ts`.

## Resultados

| Participante | Experiencia | Tiempo | ¿Menos de 5 min? | Atascos | Leyó además del README | Comentarios |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | Pendiente |
