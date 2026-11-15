/**
 * The SDK stays in step with the published contract (004, research R2, Principio IX).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createClient } from '../src/index.ts';
import { generate, readContract } from '../scripts/generate.ts';

const GENERATED = new URL('../src/generated/openapi.ts', import.meta.url);

describe('SDK and contract', () => {
  it('has types generated from the current contract (run "pnpm --filter @urlkit/sdk generate")', async () => {
    const expected = await generate(readContract());
    expect(
      readFileSync(GENERATED, 'utf8') === expected,
      'src/generated/openapi.ts is out of date: run `pnpm --filter @urlkit/sdk generate`',
    ).toBe(true);
  });

  it('notices a contract change that was not regenerated', async () => {
    const changed = readContract().replace('"version": "1.2.0"', '"version": "9.9.9"');
    expect(changed).not.toBe(readContract());
    expect(await generate(changed)).not.toBe(readFileSync(GENERATED, 'utf8'));
  });

  describe('one method per tool operation (FR-022, SC-002)', () => {
    /** Tool operations of a contract that a client lacks, and client methods with no operation. */
    function coverage(contractText: string, client: object) {
      const contract = JSON.parse(contractText) as {
        paths: Record<string, Record<string, { operationId?: string; tags?: string[] }>>;
      };
      const operations = Object.values(contract.paths)
        .flatMap((methods) => Object.values(methods))
        .filter((op) => op.tags?.includes('tools'))
        .map((op) => op.operationId ?? '');
      const methods = Object.keys(client);
      return {
        missing: operations.filter((id) => !methods.includes(id)),
        extra: methods.filter((id) => !operations.includes(id)),
      };
    }

    it('has exactly the tool operations of the contract', () => {
      expect(coverage(readContract(), createClient())).toEqual({ missing: [], extra: [] });
      expect(Object.keys(createClient())).toHaveLength(10);
    });

    it('names a tool operation the client lacks', () => {
      const contract = JSON.parse(readContract()) as { paths: Record<string, unknown> };
      contract.paths['/future'] = { post: { operationId: 'futureTool', tags: ['tools'] } };
      expect(coverage(JSON.stringify(contract), createClient()).missing).toEqual(['futureTool']);
    });
  });
});
