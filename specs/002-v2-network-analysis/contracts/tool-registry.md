# Contract: cambios en el registro de herramientas (v2)

**Paquete**: `packages/core` | **Feature**: [spec.md](../spec.md) | **Base**: [registro de la 001](../../001-mvp-url-toolkit/contracts/tool-registry.md)

La interfaz `ToolDefinition` no cambia. Añadir las cinco herramientas solo amplía dos tipos, y
ninguna herramienta del MVP cambia salvo su lista `sendTo`.

```ts
type ToolId =
  | 'clean' | 'parse' | 'inspect' | 'diff' | 'explain'          // MVP
  | 'headers' | 'metadata' | 'tls' | 'dns' | 'security';      // v2, runsOn: 'server'

interface ToolContext {
  catalog?: RuleCatalog;          // ahora también lleva los criterios de seguridad y metadatos (research R8)
  fetchHop?: FetchHop;            // MVP: inspect
  // v2: adaptadores de red; el núcleo sigue sin conocer la red
  fetchChain?: (url: string, opts: { body: 'none' | 'html' }) => Promise<Result<ChainObservation>>;
  probeTls?: (target: { host: string; port: number; sni: boolean }) => Promise<TlsObservation | TlsFailure>;
  queryDns?: (asciiName: string, opts: { dmarcOf: string | null }) => Promise<DnsObservation | { kind: 'unavailable' }>;
  parseHtml?: (html: string) => HtmlNode; // Metadata: parse5, inyectado desde `@urlkit/core/html`
}
```

Los tipos están en `packages/core/src/tools/{headers,tls,dns}/types.ts`. `fetchChain` devuelve un
`Result` porque la URL de entrada puede no ser válida, igual que `inspect`. `queryDns` consulta
siempre los ocho tipos de FR-050, y `dmarcOf` es el dominio registrable cuyo `_dmarc` se consulta.

`security.run` usa los tres adaptadores y llama a las funciones puras de las otras herramientas.
**No** vuelve a pasar por el registro ni por sus cuotas.

## Garantías nuevas

- Con la misma observación, `run` da siempre el mismo resultado: el núcleo nunca lee el reloj y
  usa `observedAt`.
- `security` produce hallazgos solo a partir de los resultados de las otras herramientas; no tiene
  reglas propias sobre la red.
- Ningún resultado contiene valores de cookies.
- `fetchChain` aplica la misma validación SSRF que `fetchHop`, porque es la misma implementación.
  `probeTls` usa la misma `resolveTarget`.

## sendTo

| Herramienta | Envía a |
|---|---|
| headers | tls, inspect, security, explain |
| metadata | headers, inspect, clean, security |
| tls | headers, dns, security |
| dns | tls, headers, security |
| security | explain, inspect, headers, tls, dns |
| inspect *(MVP, ampliada)* | lo que ya tenía + headers, security |
| explain *(MVP, ampliada)* | lo que ya tenía + security |
