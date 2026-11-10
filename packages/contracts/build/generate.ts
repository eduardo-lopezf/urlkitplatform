/** Writes packages/contracts/openapi.json. CI fails if the committed file is stale (T042a). */
import { writeFileSync } from 'node:fs';
import { buildOpenApiDocument } from '../src/openapi.ts';

writeFileSync(
  new URL('../openapi.json', import.meta.url),
  JSON.stringify(buildOpenApiDocument(), null, 2) + '\n',
);
console.warn('contracts: openapi.json generated');
