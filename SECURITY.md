# Política de seguridad

URLkit maneja URLs que pueden contener tokens, identificadores de sesión y datos personales. La
seguridad y la privacidad no son una característica del producto: son su premisa.

## Reportar una vulnerabilidad

Si encuentras una vulnerabilidad, **no la publiques en una issue**. Escribe en privado a la
dirección de seguridad del proyecto _(pendiente de publicar)_ con:

- Qué permite hacer el fallo y qué impacto tiene.
- Los pasos o la petición mínima para reproducirlo.
- La versión o el commit en el que lo observaste.

Compromiso de respuesta: acuse de recibo en 72 horas y una primera valoración en 7 días. Se
acordará contigo el momento de la divulgación; se dará crédito a quien lo reporte salvo que
prefiera lo contrario.

## En alcance

Lo que nos interesa especialmente, por orden:

1. **SSRF en Redirect Inspector**: cualquier forma de alcanzar una dirección interna, privada, de
   loopback o de metadatos, incluido DNS rebinding, respuestas de resolución mixtas, direcciones
   IPv4 mapeadas en IPv6, redirecciones que cambian de destino entre la validación y la conexión,
   o puertos y esquemas que no deberían pasar.
2. **Fuga de datos de usuario**: cualquier camino por el que una URL enviada aparezca en registros,
   trazas, métricas, el servicio de errores, un tercero o una respuesta a otro visitante.
3. **XSS o inyección** al presentar una URL analizada, y esquemas peligrosos (`javascript:`,
   `data:`) que se rendericen como enlaces activos.
4. **Elusión de los límites de uso** o de la seudonimización del visitante.
5. **Resultados de limpieza incorrectos con consecuencias de seguridad**, por ejemplo una URL que
   tras limpiarse apunta a un destino distinto del original.

## Fuera de alcance

- Resultados de limpieza discutibles sin impacto de seguridad: son un reporte de reglas, no una
  vulnerabilidad. Ábrelos como issue normal.
- Ausencia de cabeceras que no apliquen a un sitio estático sin cookies ni sesiones.
- Ataques que requieran acceso físico al dispositivo del usuario o un navegador ya comprometido.
- Denegación de servicio por volumen bruto contra la API pública.

## Lo que el producto garantiza

Son garantías verificables y, si alguna no se cumple, eso **es** la vulnerabilidad:

- Las URLs enviadas no se almacenan, ni en base de datos ni en registros.
- Cuatro de las cinco herramientas no envían la URL a ningún servidor.
- No se usan cookies ni identificadores de visitante persistentes.
- Las direcciones IP se seudonimizan con una clave que rota a diario y solo viven durante la
  ventana del contador de uso.
- Las peticiones salientes se validan antes de conectar y se conectan a la IP ya validada.

El detalle está en [docs/privacidad.md](docs/privacidad.md) y en `docs/arquitectura.md`,
sección 9.
