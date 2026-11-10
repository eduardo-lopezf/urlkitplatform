import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODES } from '@urlkit/core/codes';
import { CONTRACT_CODES } from '../src/errors.ts';

const doc = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8')) as {
  components: { schemas: Record<string, { enum?: string[] }> };
};
const published = doc.components.schemas.MessageCode?.enum ?? [];

describe('message codes in the published contract', () => {
  it('publishes every code the core emits', () => {
    expect(CODES.filter((code) => !published.includes(code))).toEqual([]);
  });

  it('publishes nothing that is neither a core code nor a contract-owned code', () => {
    const known = new Set<string>([...CODES, ...CONTRACT_CODES]);
    expect(published.filter((code) => !known.has(code))).toEqual([]);
  });

  it('keeps contract-owned codes out of the core', () => {
    for (const code of CONTRACT_CODES)
      expect((CODES as readonly string[]).includes(code)).toBe(false);
    expect(CONTRACT_CODES).toEqual(
      expect.arrayContaining(['quota.exceeded', 'auth.missing', 'auth.invalid']),
    );
  });

  it('restricts ToolError.code to error codes', () => {
    const errorCodes = doc.components.schemas.ErrorCode?.enum ?? [];
    expect(errorCodes).toEqual(
      expect.arrayContaining([
        'url.invalid',
        'url.too-long',
        'url.unsupported-scheme',
        'quota.exceeded',
      ]),
    );
    expect(errorCodes.every((code) => published.includes(code))).toBe(true);
  });
});
