# Contract: registro de herramientas del núcleo

**Paquete**: `packages/core` | **Feature**: [spec.md](../spec.md)

Interfaz común con la que se registra cada herramienta (Principio I). La web y la API la usan
para descubrir herramientas, validar entradas y ejecutar el núcleo. Añadir una herramienta no
modifica las demás.

```ts
type ToolId = 'clean' | 'parse' | 'inspect' | 'diff' | 'explain'; // ampliable en la v2

interface ToolDefinition<I, O> {
  id: ToolId;
  version: string;                  // semver de la herramienta
  runsOn: 'client' | 'server';      // 'server' solo para inspect en el MVP
  input: Schema<I>;                 // esquema compartido con la API (Zod)
  output: Schema<O>;
  run(input: I, ctx: ToolContext): O | Promise<O>; // puro si runsOn === 'client'
  sendTo: ToolId[];                 // destinos de "Enviar a" (FR-004)
  share: { encode(input: I): string; decode(fragment: string): I }; // enlaces compartibles
}

interface ToolContext {
  rules: CompiledRules;             // catálogo compilado de packages/rules
  // inspect recibe aquí su adaptador de red; el núcleo no conoce la red
  fetchHop?: (url: string) => Promise<HopResponse>;
}

registerTool(def: ToolDefinition<any, any>): void;
getTool(id: ToolId): ToolDefinition<any, any>;
listTools(): ToolDefinition<any, any>[];
```

## Garantías

- `run` es determinista para herramientas `client`: la misma entrada da la misma salida (FR-053).
- `run` nunca lanza excepciones por entradas de usuario: devuelve un `ToolError` (ver
  [data-model.md](../data-model.md)).
- Los tipos de entrada y salida coinciden con los esquemas de [openapi.yaml](./openapi.yaml).
- Cada herramienta tiene pruebas con sus vectores en `packages/core/tests`.
