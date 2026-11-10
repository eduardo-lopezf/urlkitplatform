# Vectores SSRF compartidos

Casos de prueba de la protección SSRF como **datos**, independientes del lenguaje (Principio V,
[`docs/arquitectura.md`](../../docs/arquitectura.md) §9, research R19).

**Todo servicio que haga peticiones salientes, en cualquier lenguaje, debe ejecutar este conjunto
completo y superarlo.** Hoy lo ejecuta `apps/api/tests/ssrf/ssrf.test.ts`; el servicio de sondas
en Python de la versión 2 tendrá que ejecutar los mismos ficheros. Un vector nuevo descubierto en un
lenguaje protege automáticamente al otro, y añadirlo no exige tocar ninguna suite.

## Formato de `vectors.json`

```jsonc
{
  "id": "redirect-to-metadata", // único y estable
  "url": "http://public.example/", // URL que se pide inspeccionar
  "dns": {
    // resolutor simulado (opcional)
    "public.example": [["93.184.216.34"]], // una lista de respuestas por nombre; cada resolución
  }, // consume la siguiente y la última se repite
  "redirects": {
    // respuesta simulada de cada destino permitido (opcional)
    "http://public.example/": "http://169.254.169.254/latest/meta-data/",
  },
  "expect": {
    "verdict": "block", // "allow" | "block"
    "reason": "private-address", // private-address | scheme | credentials | port | unresolvable
    "atHop": 1, // salto (desde 0) en el que se bloquea
    "neverConnectTo": ["127.0.0.1"], // direcciones a las que nunca se debe conectar (opcional)
  },
}
```

Reglas que el ejecutor de cualquier lenguaje debe respetar:

1. Las IPs literales en la URL se validan sin resolver.
2. Un nombre se resuelve **una sola vez** por conexión; se validan **todas** las direcciones
   devueltas y se conecta a una de ellas. Si alguna es interna, se bloquea.
3. La validación completa (esquema, credenciales, puerto, direcciones) se repite en **cada** salto.
4. Una URL sin `redirects` responde 200 y termina la cadena.
5. `neverConnectTo` se comprueba sobre la dirección que el ejecutor entrega a su capa de conexión.
